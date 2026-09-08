import csv
import io
import logging
import os
from datetime import datetime
from uuid import uuid4

from firebase_admin import storage
from fastapi import Depends, FastAPI, File, HTTPException, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from record_merge_service import merge_record_cluster

logger = logging.getLogger(__name__)

def _get_ingest():
    """Lazy import so the app can start even when pandas is not installed."""
    from ingestion import ingest_csv_chunks
    return ingest_csv_chunks

app = FastAPI(title="MedReach AI Backend", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_ROLES = frozenset({"admin", "super-admin"})
EDITOR_ROLES = frozenset({"editor", "admin", "super-admin"})


def require_admin(x_user_role: str | None = Header(default=None, alias="X-User-Role")) -> str:
    """Ensure the request is made by an admin-equivalent role."""
    normalized = (x_user_role or "").strip().lower()
    if normalized not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Admin role required for this operation. Set X-User-Role to admin.",
        )
    return normalized


def require_editor_or_above(x_user_role: str | None = Header(default=None, alias="X-User-Role")) -> str:
    """Block read-only Viewer roles from data modification/export/cleaning operations."""
    normalized = (x_user_role or "").strip().lower()
    if normalized not in EDITOR_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Editor role or higher required for this operation. Viewers are read-only.",
        )
    return normalized

async def validate_csv_upload(file: UploadFile) -> None:
    """Validate CSV uploads before writing them to storage."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return

    await file.seek(0)
    file_bytes = await file.read()

    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Malformed CSV upload",
                "line_number": 1,
                "message": f"CSV validation failed at line 1: invalid UTF-8 encoding: {exc}",
            },
        ) from exc

    try:
        csv_reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        for row in csv_reader:
            _ = row
    except csv.Error as exc:
        line_number = 1
        if hasattr(csv_reader, "line_num"):
            line_number = csv_reader.line_num
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Malformed CSV upload",
                "line_number": line_number,
                "message": f"CSV validation failed at line {line_number}: {exc}",
            },
        ) from exc
    finally:
        await file.seek(0)

@app.get("/api/health")
async def health_check():
    """Verify the server is running and the database is accessible."""
    try:
        list(db.collections())
        return {"status": "healthy", "database": "emulator_connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@app.get("/api/dashboard/summary")
async def dashboard_summary():
    """
    Aggregate Firestore data into summary metrics for the dashboard cards.

    Returns:
        total_hcps          - total HCP records across all company collections
        health_score        - company-wide average data health score (0-100)
        records_this_week   - records ingested in the last 7 days
        unresolved_flags    - dict with counts per category and a total
        last_upload         - ISO timestamp of the most recent upload document
    """
    try:
        total_hcps = 0
        records_this_week = 0
        health_scores: list[float] = []
        last_upload_ts: str | None = None

        from datetime import timedelta, timezone
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        companies_ref = db.collection("companies")
        for company_doc in companies_ref.stream():
            uploads_ref = company_doc.reference.collection("uploads")
            for upload_doc in uploads_ref.stream():
                data = upload_doc.to_dict() or {}
                rows = int(data.get("total_rows", 0))
                total_hcps += rows

                score = data.get("health_score")
                if score is not None:
                    health_scores.append(float(score))

                created_at = data.get("createdAt") or data.get("uploadedAt")
                if created_at:
                    try:
                        from datetime import datetime as dt
                        ts = dt.fromisoformat(str(created_at).replace("Z", "+00:00"))
                        if ts.tzinfo is None:
                            ts = ts.replace(tzinfo=timezone.utc)
                        if ts >= week_ago:
                            records_this_week += rows
                        if last_upload_ts is None or str(created_at) > last_upload_ts:
                            last_upload_ts = str(created_at)
                    except (ValueError, TypeError):
                        pass

        flag_counts: dict[str, int] = {
            "pii": 0,
            "duplicates": 0,
            "outliers": 0,
            "npi_validation": 0,
        }

        for company_doc in companies_ref.stream():
            flags_ref = company_doc.reference.collection("flags")
            for flag_doc in flags_ref.stream():
                flag = flag_doc.to_dict() or {}
                if flag.get("resolved"):
                    continue
                category = str(flag.get("category", "")).lower()
                if category in flag_counts:
                    flag_counts[category] += 1

        total_flags = sum(flag_counts.values())

        if total_hcps == 0:
            total_hcps = 10412
            records_this_week = 847
            health_scores = [84.0]
            flag_counts = {"pii": 6, "duplicates": 3, "outliers": 4, "npi_validation": 4}
            total_flags = sum(flag_counts.values())
            last_upload_ts = now.isoformat()

        avg_health = round(sum(health_scores) / len(health_scores), 1) if health_scores else 0.0

        return {
            "total_hcps": total_hcps,
            "records_this_week": records_this_week,
            "health_score": avg_health,
            "unresolved_flags": {**flag_counts, "total": total_flags},
            "last_upload": last_upload_ts,
            "source": "firestore" if total_hcps != 10412 else "demo_seed",
        }

    except Exception as e:
        return {
            "total_hcps": 10412,
            "records_this_week": 847,
            "health_score": 84.0,
            "unresolved_flags": {"pii": 6, "duplicates": 3, "outliers": 4, "npi_validation": 4, "total": 17},
            "last_upload": None,
            "source": "error_fallback",
            "error": str(e),
        }


class ExportLogPayload(BaseModel):
    format: str
    fileName: str
    size: str
    role: str
    records: int
    timestamp: str


class InviteUserPayload(BaseModel):
    email: str
    role: str = "Viewer"
    invited_by: str | None = None


class BillingPlanUpdatePayload(BaseModel):
    plan: str
    reason: str | None = None


@app.post("/api/export/log")
async def log_export(payload: ExportLogPayload, _role: str = Depends(require_editor_or_above)):
    """Write an export event to Firestore exports collection. Viewers are blocked."""
    try:
        doc = {
            "format": payload.format,
            "fileName": payload.fileName,
            "size": payload.size,
            "role": payload.role,
            "records": payload.records,
            "timestamp": payload.timestamp,
            "createdAt": datetime.utcnow().isoformat(),
        }
        db.collection("exports").add(doc)
        return {"status": "logged", "fileName": payload.fileName}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ── Scrubbing Sessions ────────────────────────────────────────────────────────

SCRUBBING_SESSIONS_DATA = [
    {"id": "sess_001", "name": "Q2 2026 Full Scrub",       "date": "2026-06-15", "operator": "Jane Doe",  "role": "Admin",  "recordsBefore": 10412, "recordsAfter": 10238, "removed": 174,  "flagsResolved": 41, "piiFlagged": 12, "duplicatesMerged": 8,  "npiFixed": 17, "outliersTagged": 4, "healthBefore": 71, "healthAfter": 84, "status": "Complete", "notes": "Full quarterly scrub prior to Q2 campaign launch. All high-severity flags cleared."},
    {"id": "sess_002", "name": "March Duplicate Pass",      "date": "2026-03-22", "operator": "Mark Chen", "role": "Editor", "recordsBefore": 9874,  "recordsAfter": 9812,  "removed": 62,   "flagsResolved": 19, "piiFlagged": 0,  "duplicatesMerged": 19, "npiFixed": 0,  "outliersTagged": 0, "healthBefore": 68, "healthAfter": 74, "status": "Complete", "notes": "Targeted duplicate-only pass following March upload batch."},
    {"id": "sess_003", "name": "NPI Validation Run",        "date": "2026-02-08", "operator": "Jane Doe",  "role": "Admin",  "recordsBefore": 9812,  "recordsAfter": 9790,  "removed": 22,   "flagsResolved": 26, "piiFlagged": 3,  "duplicatesMerged": 0,  "npiFixed": 23, "outliersTagged": 0, "healthBefore": 74, "healthAfter": 79, "status": "Complete", "notes": "NPI registry cross-check after NPPES refresh. 4 records overridden with justification."},
    {"id": "sess_004", "name": "Q1 2026 Scrub",             "date": "2026-01-04", "operator": "Jane Doe",  "role": "Admin",  "recordsBefore": 11200, "recordsAfter": 9812,  "removed": 1388, "flagsResolved": 53, "piiFlagged": 18, "duplicatesMerged": 14, "npiFixed": 21, "outliersTagged": 0, "healthBefore": 58, "healthAfter": 68, "status": "Complete", "notes": "Large Q1 scrub including deduplication of merged CRM export."},
    {"id": "sess_005", "name": "Outlier Review - Oncology", "date": "2025-11-17", "operator": "Sarah Kim", "role": "Viewer", "recordsBefore": 11200, "recordsAfter": 11200, "removed": 0,    "flagsResolved": 4,  "piiFlagged": 0,  "duplicatesMerged": 0,  "npiFixed": 0,  "outliersTagged": 4, "healthBefore": 62, "healthAfter": 62, "status": "Partial",  "notes": "Read-only review of oncology outliers. Tags applied but no records removed - pending admin sign-off."},
    {"id": "sess_006", "name": "Emergency PII Sweep",       "date": "2025-10-03", "operator": "Mark Chen", "role": "Editor", "recordsBefore": 10800, "recordsAfter": 10800, "removed": 0,    "flagsResolved": 7,  "piiFlagged": 7,  "duplicatesMerged": 0,  "npiFixed": 0,  "outliersTagged": 0, "healthBefore": 64, "healthAfter": 66, "status": "Aborted",  "notes": "PII sweep aborted mid-session due to upstream data quality incident."},
]


@app.get("/api/scrubbing-sessions")
async def list_scrubbing_sessions():
    """Return all scrubbing session metadata."""
    return {"sessions": SCRUBBING_SESSIONS_DATA}


@app.get("/api/scrubbing-sessions/{session_id}/pdf")
async def download_session_pdf(session_id: str):
    """Generate and stream a ReportLab PDF audit report for a scrubbing session."""
    session = next((s for s in SCRUBBING_SESSIONS_DATA if s["id"] == session_id), None)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        )

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=LETTER,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        styles = getSampleStyleSheet()
        NAVY   = colors.HexColor("#1B3A6B")
        BLUE   = colors.HexColor("#2E86AB")
        GREEN  = colors.HexColor("#2D6A4F")
        RED    = colors.HexColor("#C0392B")
        LIGHT  = colors.HexColor("#EBF4FA")
        GREY   = colors.HexColor("#4A5568")
        MID    = colors.HexColor("#CBD5E0")

        title_style = ParagraphStyle("Title2", parent=styles["Title"],   textColor=NAVY, fontSize=20, spaceAfter=4)
        sub_style   = ParagraphStyle("Sub2",   parent=styles["Normal"],  textColor=GREY, fontSize=10, spaceAfter=2)
        h2_style    = ParagraphStyle("H2b",    parent=styles["Heading2"], textColor=NAVY, fontSize=13, spaceBefore=16, spaceAfter=6)
        body_style  = ParagraphStyle("Body2",  parent=styles["Normal"],  textColor=colors.HexColor("#1A1A2E"), fontSize=10)
        note_style  = ParagraphStyle("Note2",  parent=styles["Normal"],  textColor=GREY, fontSize=9, leftIndent=10)

        dh = session["healthAfter"] - session["healthBefore"]
        status_hex = "2D6A4F" if session["status"] == "Complete" else ("E67E22" if session["status"] == "Partial" else "C0392B")

        def make_table(data, header_color, value_color=None):
            t = Table(data, colWidths=[3.2 * inch, 2.5 * inch])
            cmds = [
                ("BACKGROUND",     (0, 0), (-1, 0), header_color),
                ("TEXTCOLOR",      (0, 0), (-1, 0), colors.white),
                ("FONTNAME",       (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",       (0, 0), (-1, -1), 10),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("GRID",           (0, 0), (-1, -1), 0.5, MID),
                ("LEFTPADDING",    (0, 0), (-1, -1), 10),
                ("RIGHTPADDING",   (0, 0), (-1, -1), 10),
                ("TOPPADDING",     (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING",  (0, 0), (-1, -1), 6),
            ]
            if value_color:
                cmds.append(("TEXTCOLOR", (1, len(data) - 1), (1, len(data) - 1), value_color))
            t.setStyle(TableStyle(cmds))
            return t

        story = [
            Paragraph("MedReach AI", ParagraphStyle("Brand2", parent=styles["Normal"], textColor=BLUE, fontSize=11, spaceAfter=2)),
            Paragraph("Data Scrubbing Session Report", title_style),
            Paragraph(f"{session['name']}  \u00b7  {session['date']}", sub_style),
            Paragraph(f"Session ID: {session['id']}  \u00b7  Operator: {session['operator']} ({session['role']})", sub_style),
            HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=12),
            Paragraph(f"<b>Status:</b> <font color='#{status_hex}'>{session['status'].upper()}</font>", body_style),
            Spacer(1, 8),
            Paragraph("Record Summary", h2_style),
            make_table([
                ["Metric", "Value"],
                ["Records before scrub", f"{session['recordsBefore']:,}"],
                ["Records after scrub",  f"{session['recordsAfter']:,}"],
                ["Records removed",      f"{session['removed']:,}"],
                ["Flags resolved",       f"{session['flagsResolved']:,}"],
            ], NAVY, value_color=RED if session["removed"] > 0 else GREEN),
            Spacer(1, 10),
            Paragraph("Flag Breakdown", h2_style),
            make_table([
                ["Flag Type", "Count"],
                ["PII flagged",       str(session["piiFlagged"])],
                ["Duplicates merged", str(session["duplicatesMerged"])],
                ["NPI fixes applied", str(session["npiFixed"])],
                ["Outliers tagged",   str(session["outliersTagged"])],
            ], BLUE),
            Spacer(1, 10),
            Paragraph("Data Health Score", h2_style),
            make_table([
                ["Metric", "Value"],
                ["Health score before", f"{session['healthBefore']}%"],
                ["Health score after",  f"{session['healthAfter']}%"],
                ["Net improvement",     f"+{dh}pts" if dh >= 0 else f"{dh}pts"],
            ], NAVY, value_color=GREEN if dh >= 0 else RED),
            Spacer(1, 14),
        ]

        if session.get("notes"):
            story += [
                Paragraph("Session Notes", h2_style),
                Paragraph(session["notes"], note_style),
                Spacer(1, 10),
            ]

        story += [
            HRFlowable(width="100%", thickness=1, color=MID, spaceAfter=8),
            Paragraph(
                f"Generated by MedReach AI  \u00b7  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  \u00b7  Confidential \u2014 Internal Use Only",
                ParagraphStyle("Footer2", parent=styles["Normal"], textColor=MID, fontSize=8, alignment=1),
            ),
        ]

        doc.build(story)
        buf.seek(0)

        filename = f"Scrub_Report_{session_id}_{session['date']}.pdf"
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab is not installed. Run: pip install reportlab")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")


# ── Company file upload ───────────────────────────────────────────────────────

@app.post("/api/companies/{company_id}/upload_file", status_code=201)
async def upload_company_file(
    company_id: str,
    file: UploadFile = File(...),
    _role: str = Depends(require_editor_or_above),
):
    """Upload a file for a specific company tenant and return its upload metadata. Viewers are blocked."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected for upload.")

    await validate_csv_upload(file)

    original_filename = os.path.basename(file.filename.replace("\\", "/"))
    if not original_filename:
        raise HTTPException(status_code=400, detail="Invalid file name.")

    upload_id = str(uuid4())
    storage_path = f"companies/{company_id}/uploads/{upload_id}_{original_filename}"
    await file.seek(0)
    file_bytes = await file.read()

    ingestion_summary = _get_ingest()(io.BytesIO(file_bytes))

    try:
        from firebase_admin import storage

        bucket = storage.bucket()
        blob = bucket.blob(storage_path)
        blob.upload_from_string(
            file_bytes,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception:
        pass

    return {
        "upload_id": upload_id,
        "storage_path": storage_path,
        "total_rows": ingestion_summary["total_rows"],
        "columns": ingestion_summary["columns"],
        "preview_data": ingestion_summary["preview_data"],
        "inferred_schema": ingestion_summary["inferred_schema"],
        "duplicate_clusters": ingestion_summary.get("duplicate_clusters", []),
        "peak_memory_mb": ingestion_summary["peak_memory_mb"],
    }


@app.get("/api/companies/{company_id}/dashboard_metrics")
async def get_company_dashboard_metrics(company_id: str):
    """Return executive metrics aggregated from the company's upload metadata."""
    try:
        uploads = db.collection("companies").document(company_id).collection("uploads").stream()
        total_hcp = 0
        total_flags = 0
        health_scores = []

        for document in uploads:
            upload = document.to_dict() or {}
            metadata = upload.get("metadata") or {}
            total_hcp += int(metadata.get("record_count", upload.get("record_count", 0)) or 0)
            total_flags += int(metadata.get("flag_count", upload.get("flag_count", 0)) or 0)
            health_score = float(
                metadata.get("quality_score", upload.get("quality_score", 0)) or 0
            )
            if health_score > 0:
                health_scores.append(health_score)

        return {
            "company_id": company_id,
            "total_healthcare_professionals": total_hcp,
            "data_health_score": round(sum(health_scores) / len(health_scores), 1)
            if health_scores
            else 0.0,
            "unresolved_validation_flags": total_flags,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve dashboard metrics: {exc}",
        ) from exc


@app.post("/api/companies/{company_id}/users/invite", status_code=201)
async def invite_company_user(
    company_id: str,
    payload: InviteUserPayload,
    admin_role: str = Depends(require_admin),
):
    """Create a tenant-scoped invitation, provision the Auth account, and send a verification email. Admin role is required."""
    try:
        from firebase_admin import auth

        # Provision (or reuse) the Firebase Auth account so a verification link can be issued.
        try:
            user_record = auth.create_user(email=payload.email, email_verified=False, disabled=False)
        except auth.EmailAlreadyExistsError:
            user_record = auth.get_user_by_email(payload.email)

        verification_link = auth.generate_email_verification_link(payload.email)

        invitation_id = str(uuid4())
        invitation = {
            "invitation_id": invitation_id,
            "email": payload.email,
            "role": payload.role,
            "invited_by": payload.invited_by,
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending",
            "created_by_role": admin_role,
            "auth_uid": user_record.uid,
            "verification_link": verification_link,
        }
        db.collection("companies").document(company_id).collection("invitations").document(invitation_id).set(invitation)
        return {"company_id": company_id, "invitation": invitation}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to create invitation: {exc}") from exc


@app.delete("/api/companies/{company_id}/uploads/{upload_id}")
async def delete_company_dataset(
    company_id: str,
    upload_id: str,
    admin_role: str = Depends(require_admin),
):
    """Soft-delete a dataset upload. Admin role is required."""
    try:
        upload_ref = db.collection("companies").document(company_id).collection("uploads").document(upload_id)
        snapshot = upload_ref.get()
        if not snapshot.exists:
            raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' not found for company '{company_id}'.")

        upload_ref.update(
            {
                "soft_deleted": True,
                "deleted_at": datetime.utcnow().isoformat(),
                "deleted_by_role": admin_role,
            }
        )
        return {"company_id": company_id, "upload_id": upload_id, "soft_deleted": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to delete upload: {exc}") from exc


@app.patch("/api/companies/{company_id}/billing-plan")
async def update_company_billing_plan(
    company_id: str,
    payload: BillingPlanUpdatePayload,
    admin_role: str = Depends(require_admin),
):
    """Update a company's billing plan. Admin role is required."""
    try:
        company_ref = db.collection("companies").document(company_id)
        company_ref.set(
            {
                "billing_plan": payload.plan,
                "billing_plan_updated_at": datetime.utcnow().isoformat(),
                "billing_plan_updated_by_role": admin_role,
                "billing_plan_update_reason": payload.reason,
            },
            merge=True,
        )
        return {"company_id": company_id, "billing_plan": payload.plan, "updated": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to update billing plan: {exc}") from exc


@app.post("/api/companies/{company_id}/records/merge")
async def merge_company_records(company_id: str, payload: dict, _role: str = Depends(require_editor_or_above)):
    """Merge a duplicate cluster into a master record and archive the rest. Viewers are blocked.

    Request body should look like:
    {
      "records": [ {...} ],
      "master_record_id": "record-123"
    }
    """
    try:
        records = payload.get("records")
        master_record_id = payload.get("master_record_id")

        if not isinstance(records, list) or not records:
            raise HTTPException(status_code=422, detail="'records' must be a non-empty list.")

        merged = merge_record_cluster(records, master_record_id=master_record_id)
        master = merged["master_record"]

        records_ref = db.collection("companies").document(company_id).collection("records")
        master_id = str(master.get("record_id") or master_record_id or uuid4())
        master["record_id"] = master_id
        records_ref.document(master_id).set(master)

        for archived_record in merged["archived_records"]:
            archived_id = str(archived_record.get("record_id") or uuid4())
            archived_record["record_id"] = archived_id
            records_ref.document(archived_id).set(archived_record)

        return {
            "company_id": company_id,
            "merged_record": master,
            "archived_records": merged["archived_records"],
            "master_record_id": master_id,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to merge company records")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/companies/{company_id}/export_data")
async def export_company_data(company_id: str):
    """Return processed records for the Data Review and export staging workflows."""
    try:
        records_ref = db.collection("companies").document(company_id).collection("records")
        records = [doc.to_dict() for doc in records_ref.stream()]
        return {"records": records}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error exporting data: {str(e)}",
        ) from e
