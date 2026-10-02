import asyncio
import csv
import io
import logging
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from firebase_admin import storage
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Header, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import google.auth
from google.auth.transport import requests as google_auth_requests
from google.cloud import storage as gcs_storage
from pydantic import BaseModel

from auth import require_role
from database import db, USE_EMULATOR
from bulk_approval_service import approve_low_severity_flags
from record_merge_service import merge_record_cluster
from scrubbing_pipeline import DEFAULT_GCS_CHUNK_SIZE, scrub_provider_records, stream_scrubbed_gcs_csv

logger = logging.getLogger(__name__)

def _get_ingest():
    """Lazy import so the app can start even when pandas is not installed."""
    from ingestion import ingest_csv_chunks
    return ingest_csv_chunks

app = FastAPI(title="MedReach AI Backend", version="1.0")

app.add_middleware(
    CORSMiddleware,
    # Vite auto-increments the port (5174, 5175, ...) if 5173 is already taken by
    # another running instance, so allow the common local-dev port range too.
    allow_origins=[
        f"http://{host}:{port}"
        for host in ("localhost", "127.0.0.1")
        for port in range(5173, 5178)
    ] + [
        "https://medreachai-679aa.web.app",
        "https://medreachai-679aa.firebaseapp.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_ROLES = frozenset({"admin", "super-admin"})
EDITOR_ROLES = frozenset({"editor", "admin", "super-admin"})
PROCESSING_ROLES = ("editor", "admin", "super-admin")
require_authenticated_editor = require_role(PROCESSING_ROLES)
FIRESTORE_PAGE_SIZE = 500
UPLOAD_BUCKET = "medreach-ai-uploads"
IS_CLOUD_RUN = bool(os.environ.get("K_SERVICE"))
GCS_SIGNING_TIMEOUT_SECONDS = 10
LOCAL_UPLOAD_DIR = Path(tempfile.gettempdir()) / "medreach-local-uploads"
LOCAL_UPLOAD_PATHS: dict[str, Path] = {}
FIRESTORE_WRITE_TIMEOUT_SECONDS = 3.0
ALLOW_OFFLINE_FIRESTORE_WRITES = not IS_CLOUD_RUN and os.getenv("MEDREACH_ALLOW_OFFLINE_FIRESTORE", "false").strip().lower() in (
    "1",
    "true",
    "yes",
)


async def _firestore_write(write_fn, *, context: str):
    """Run a blocking Firestore write with a short timeout.

    The default gRPC deadline can block the event loop for ~60s when the
    emulator is unreachable, so bound the wait ourselves. If the emulator is
    unreachable and MEDREACH_ALLOW_OFFLINE_FIRESTORE=1, skip the write so the
    rest of the pipeline (e.g. CSV chunking) can still be tested locally;
    otherwise fail fast with a clear error.
    """
    try:
        return await asyncio.wait_for(asyncio.to_thread(write_fn), timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS)
    except Exception as exc:
        if USE_EMULATOR and ALLOW_OFFLINE_FIRESTORE_WRITES:
            logger.warning("Skipping Firestore write (%s) — emulator unreachable: %s", context, exc)
            return None
        hint = (
            "Start the Firestore emulator (`firebase emulators:start --only firestore`), "
            "or set MEDREACH_ALLOW_OFFLINE_FIRESTORE=1 to skip database writes in local dev."
            if USE_EMULATOR
            else "Check Firestore connectivity and credentials."
        )
        raise HTTPException(
            status_code=503,
            detail=f"Firestore is unreachable while {context}. {hint}",
        ) from exc


async def _firestore_write_best_effort(write_fn, *, context: str) -> None:
    """Attempt a Firestore write with a short timeout; never raises, so a
    background job keeps running even when Firestore is unreachable."""
    try:
        await asyncio.wait_for(asyncio.to_thread(write_fn), timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.warning("Skipping Firestore update (%s): %s", context, exc)


def _iam_signing_kwargs() -> dict:
    """On Cloud Run the attached service account has no private key, so
    generate_signed_url must be told to sign via the IAM credentials API.
    Local/dev runs use emulators and never reach real GCS, so skip this.
    """
    if not IS_CLOUD_RUN:
        return {}
    credentials, _ = google.auth.default()
    credentials.refresh(google_auth_requests.Request())
    return {"service_account_email": credentials.service_account_email, "access_token": credentials.token}


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
        await asyncio.wait_for(
            asyncio.to_thread(lambda: list(db.collections())),
            timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS,
        )
        return {"status": "healthy", "database": "emulator_connected" if USE_EMULATOR else "firestore_connected"}
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

    Firestore reads are offloaded to a thread and bounded by a short timeout so
    an unreachable emulator can't block the event loop for the default ~60s
    gRPC deadline; the existing demo-seed fallback below covers that case too.
    """
    def _compute():
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
            for category in flag_counts:
                unresolved_flags = (
                    flags_ref.where("resolved", "==", False)
                    .where("category", "==", category)
                    .stream()
                )
                flag_counts[category] += sum(1 for _ in unresolved_flags)

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

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_compute), timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS + 1
        )
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


class SignedUrlPayload(BaseModel):
    filename: str
    content_type: str = "text/csv"


class ProcessUploadPayload(BaseModel):
    object_name: str
    skip_npi_validation: bool = False
    delete_source_on_success: bool = False


@app.post("/api/uploads/generate-signed-url")
async def generate_signed_upload_url(
    payload: SignedUrlPayload,
    user: dict = Depends(require_authenticated_editor),
):
    """Generate an owner-scoped short-lived V4 URL for a raw CSV upload."""
    filename = payload.filename.strip()
    if not filename or filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="A valid filename without path components is required.")
    if payload.content_type != "text/csv":
        raise HTTPException(status_code=400, detail="Only text/csv uploads are supported.")

    owner_uid = str(user.get("uid") or user.get("sub") or "").strip()
    if not owner_uid:
        raise HTTPException(status_code=401, detail="Authenticated user is missing a UID.")

    object_name = f"raw_uploads/{owner_uid}/{uuid4()}_{filename}"

    def _sign() -> str:
        blob = gcs_storage.Client().bucket(UPLOAD_BUCKET).blob(object_name)
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15),
            method="PUT",
            content_type=payload.content_type,
            **_iam_signing_kwargs(),
        )

    try:
        signed_url = await asyncio.wait_for(asyncio.to_thread(_sign), timeout=GCS_SIGNING_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Timed out generating the GCS upload URL. Check service account credentials.",
        ) from exc
    except Exception as exc:
        logger.exception("Failed to generate signed upload URL")
        raise HTTPException(status_code=500, detail="Unable to generate upload URL.") from exc

    return {
        "signed_url": signed_url,
        "object_name": object_name,
        "expires_in": 900,
    }


async def _process_uploaded_csv_job(
    job_id: str,
    object_name: str,
    *,
    skip_npi_validation: bool,
    delete_source_on_success: bool,
) -> None:
    job_ref = db.collection("processing_jobs").document(job_id)
    total_records = 0
    completed_batches = 0
    max_batch_records = 0

    try:
        await _firestore_write_best_effort(
            lambda: job_ref.update(
                {"status": "processing", "started_at": datetime.now(timezone.utc).isoformat()},
                retry=None,
                timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS,
            ),
            context=f"job {job_id} start update",
        )
        async for records in stream_scrubbed_gcs_csv(
            object_name,
            bucket_name=UPLOAD_BUCKET,
            batch_size=DEFAULT_GCS_CHUNK_SIZE,
            validate_npi=not skip_npi_validation,
        ):
            batch_records = len(records)
            total_records += batch_records
            completed_batches += 1
            max_batch_records = max(max_batch_records, batch_records)

            if completed_batches % 20 == 0:
                await _firestore_write_best_effort(
                    lambda: job_ref.update(
                        {
                            "completed_batches": completed_batches,
                            "records_processed": total_records,
                            "max_batch_records": max_batch_records,
                        },
                        retry=None,
                        timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS,
                    ),
                    context=f"job {job_id} progress update",
                )

        if delete_source_on_success:
            gcs_storage.Client().bucket(UPLOAD_BUCKET).blob(object_name).delete()

        await _firestore_write_best_effort(
            lambda: job_ref.update(
                {
                    "status": "completed",
                    "completed_batches": completed_batches,
                    "records_processed": total_records,
                    "max_batch_records": max_batch_records,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                },
                retry=None,
                timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS,
            ),
            context=f"job {job_id} completion update",
        )
    except Exception as exc:
        logger.exception("CSV processing job %s failed", job_id)
        failure_reason = f"Processing failed ({type(exc).__name__})."
        await _firestore_write_best_effort(
            lambda: job_ref.update(
                {
                    "status": "failed",
                    "error": failure_reason,
                    "completed_batches": completed_batches,
                    "records_processed": total_records,
                    "max_batch_records": max_batch_records,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                },
                retry=None,
                timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS,
            ),
            context=f"job {job_id} failure update",
        )


@app.post("/api/companies/{company_id}/uploads/process", status_code=202)
async def start_company_upload_processing(
    company_id: str,
    payload: ProcessUploadPayload,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_authenticated_editor),
):
    """Queue an owner-scoped GCS CSV for bounded, asynchronous scrubbing."""
    owner_uid = str(user.get("uid") or user.get("sub") or "").strip()
    role = str(user.get("role") or "").strip().lower()
    object_name = payload.object_name.strip()
    owner_prefix = f"raw_uploads/{owner_uid}/"

    if not owner_uid:
        raise HTTPException(status_code=401, detail="Authenticated user is missing a UID.")
    if not object_name.startswith(owner_prefix):
        raise HTTPException(status_code=403, detail="The upload does not belong to the authenticated user.")
    if not object_name.lower().endswith(".csv") or ".." in object_name.split("/"):
        raise HTTPException(status_code=400, detail="A valid staged CSV object is required.")
    if payload.skip_npi_validation and role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Skipping NPI validation is limited to administrators.")

    job_id = str(uuid4())
    job_ref = db.collection("processing_jobs").document(job_id)
    await _firestore_write(
        lambda: job_ref.set(
            {
                "job_id": job_id,
                "company_id": company_id,
                "owner_uid": owner_uid,
                "object_name": object_name,
                "status": "queued",
                "batch_size": DEFAULT_GCS_CHUNK_SIZE,
                "skip_npi_validation": payload.skip_npi_validation,
                "completed_batches": 0,
                "records_processed": 0,
                "max_batch_records": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            retry=None,
            timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS,
        ),
        context=f"queuing upload job for company '{company_id}'",
    )
    background_tasks.add_task(
        _process_uploaded_csv_job,
        job_id,
        object_name,
        skip_npi_validation=payload.skip_npi_validation,
        delete_source_on_success=payload.delete_source_on_success,
    )
    return {"job_id": job_id, "company_id": company_id, "status": "queued"}


@app.get("/api/companies/{company_id}/uploads/process/{job_id}")
async def get_company_upload_processing_status(
    company_id: str,
    job_id: str,
    user: dict = Depends(require_authenticated_editor),
):
    """Return processing status only to the user who staged the source object."""
    owner_uid = str(user.get("uid") or user.get("sub") or "").strip()
    snapshot = db.collection("processing_jobs").document(job_id).get()
    job = snapshot.to_dict() if snapshot.exists else None
    if not job or job.get("owner_uid") != owner_uid or job.get("company_id") != company_id:
        raise HTTPException(status_code=404, detail="Processing job not found.")

    return {
        key: job.get(key)
        for key in (
            "job_id",
            "company_id",
            "status",
            "batch_size",
            "completed_batches",
            "records_processed",
            "max_batch_records",
            "skip_npi_validation",
            "error",
        )
        if key in job
    }


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


# ── Signed URL direct-to-GCS upload ────────────────────────────────────────────

class GenerateUploadUrlRequest(BaseModel):
    company_id: str
    filename: str
    content_type: str | None = None


@app.post("/api/upload/generate-url")
async def generate_upload_url(
    payload: GenerateUploadUrlRequest,
    request: Request,
    _role: str = Depends(require_editor_or_above),
):
    """Return an upload URL for the client to PUT the raw file to.

    In emulator/dev mode there are no real GCS credentials, so signing a v4
    URL would otherwise hang trying to resolve IAM credentials via the GCE
    metadata server; route those uploads to a local receiver instead.
    """
    original_filename = os.path.basename(payload.filename.replace("\\", "/"))
    if not original_filename:
        raise HTTPException(status_code=400, detail="A file name is required.")

    upload_id = str(uuid4())
    storage_path = f"companies/{payload.company_id}/uploads/{upload_id}_{original_filename}"
    content_type = payload.content_type or "application/octet-stream"

    if USE_EMULATOR:
        LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        LOCAL_UPLOAD_PATHS[upload_id] = LOCAL_UPLOAD_DIR / f"{upload_id}_{original_filename}"
        local_upload_url = f"{str(request.base_url).rstrip('/')}/api/local-uploads/{upload_id}"
        return {"upload_id": upload_id, "upload_url": local_upload_url, "storage_path": storage_path}

    def _sign() -> str:
        blob = storage.bucket().blob(storage_path)
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=30),
            method="PUT",
            content_type=content_type,
            **_iam_signing_kwargs(),
        )

    try:
        upload_url = await asyncio.wait_for(asyncio.to_thread(_sign), timeout=GCS_SIGNING_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail="Timed out generating the GCS upload URL. Check service account credentials.",
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {e}") from e

    return {"upload_id": upload_id, "upload_url": upload_url, "storage_path": storage_path}


@app.put("/api/local-uploads/{upload_id}", include_in_schema=False)
async def receive_local_upload(upload_id: str, request: Request):
    """Accept a raw PUT body for emulator-mode uploads, streamed to disk."""
    file_path = LOCAL_UPLOAD_PATHS.get(upload_id)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Unknown or expired local upload URL.")

    uploaded_bytes = 0
    try:
        with file_path.open("wb") as output_file:
            async for chunk in request.stream():
                output_file.write(chunk)
                uploaded_bytes += len(chunk)
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    finally:
        LOCAL_UPLOAD_PATHS.pop(upload_id, None)

    return {"storage_path": str(file_path), "uploaded_bytes": uploaded_bytes}


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

    # Run the CPU-bound pandas ingestion off the event loop so concurrent requests aren't serialized behind it.
    ingestion_summary = await asyncio.to_thread(_get_ingest(), io.BytesIO(file_bytes))
    scrubbed_records = await scrub_provider_records(ingestion_summary.get("records", []))

    def _upload_to_storage() -> None:
        bucket = storage.bucket()
        blob = bucket.blob(storage_path)
        blob.upload_from_string(
            file_bytes,
            content_type=file.content_type or "application/octet-stream",
        )

    try:
        # Storage writes are blocking network I/O; run in a thread so a slow/unreachable
        # bucket can't stall the event loop for every other concurrent upload.
        await asyncio.to_thread(_upload_to_storage)
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
        "records": scrubbed_records,
        "peak_memory_mb": ingestion_summary["peak_memory_mb"],
    }


@app.get("/api/companies/{company_id}/dashboard_metrics")
async def get_company_dashboard_metrics(company_id: str):
    """Return executive metrics aggregated from the company's upload metadata.

    Firestore reads are offloaded to a thread and bounded by a short, retry-free
    deadline so an unreachable emulator can't block the event loop (and every
    other in-flight request) for the default ~60s gRPC deadline.
    """
    def _fetch_uploads():
        query = db.collection("companies").document(company_id).collection("uploads")
        return list(query.stream(retry=None, timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS))

    try:
        uploads = await asyncio.wait_for(
            asyncio.to_thread(_fetch_uploads), timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS + 1
        )
    except Exception:
        logger.warning("Firestore unreachable while fetching dashboard metrics for '%s'.", company_id)
        return {
            "company_id": company_id,
            "total_healthcare_professionals": 0,
            "data_health_score": 0.0,
            "unresolved_validation_flags": 0,
            "source": "offline_fallback",
        }

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


@app.get("/api/companies/{company_name}/records")
async def get_company_records(company_name: str):
    """Return an empty records collection for the company dashboard."""
    return {"company_name": company_name, "records": []}


@app.get("/api/companies/{company_name}/provider_walkthrough")
async def get_company_provider_walkthrough(company_name: str):
    """Return an empty provider walkthrough collection for the dashboard."""
    return {"company_name": company_name, "records": []}


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

        # Run PII/NPI/anomaly detection before persisting so Data Review reflects
        # real quality signals instead of raw-field heuristics (this endpoint is
        # the one the real upload flow calls; other upload paths already scrub).
        scrubbed_records = await scrub_provider_records(records)

        merged = merge_record_cluster(scrubbed_records, master_record_id=master_record_id)
        master = merged["master_record"]
        merged_at = datetime.now(timezone.utc).isoformat()

        records_ref = db.collection("companies").document(company_id).collection("records")
        master_id = str(master.get("record_id") or master_record_id or uuid4())
        master["record_id"] = master_id
        master["merged_at"] = merged_at
        await _firestore_write(
            lambda: records_ref.document(master_id).set(
                master, retry=None, timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS
            ),
            context=f"merging records for company '{company_id}'",
        )

        for archived_record in merged["archived_records"]:
            archived_id = str(archived_record.get("record_id") or uuid4())
            archived_record["record_id"] = archived_id
            archived_record["merged_at"] = merged_at
            await _firestore_write(
                lambda archived_record=archived_record, archived_id=archived_id: records_ref.document(
                    archived_id
                ).set(archived_record, retry=None, timeout=FIRESTORE_WRITE_TIMEOUT_SECONDS),
                context=f"archiving a duplicate record for company '{company_id}'",
            )

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


class BulkApproveLowSeverityPayload(BaseModel):
    flag_ids: list[str] | None = None


@app.post("/api/companies/{company_id}/flags/approve-low-severity")
async def approve_low_severity_flags_endpoint(
    company_id: str,
    payload: BulkApproveLowSeverityPayload,
    _role: str = Depends(require_editor_or_above),
):
    """Bulk-approve all Low-severity flags for a company. Viewers are blocked.

    Uses Firestore batched writes (at most 500 operations per batch) so
    large flag sets are approved in a small, fixed number of round trips.
    """
    try:
        result = approve_low_severity_flags(db, company_id, flag_ids=payload.flag_ids)
        return {"company_id": company_id, **result}
    except Exception as exc:
        logger.exception("Failed to bulk-approve low-severity flags")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/companies/{company_id}/export_data")
async def export_company_data(
    company_id: str,
    page_size: int = Query(FIRESTORE_PAGE_SIZE, ge=1, le=1000),
    cursor: str | None = Query(default=None),
):
    """Return processed records for the Data Review and export staging workflows."""
    try:
        records_ref = db.collection("companies").document(company_id).collection("records")
        records_query = records_ref.order_by("__name__")
        if cursor:
            cursor_snapshot = records_ref.document(cursor).get()
            if not cursor_snapshot.exists:
                raise HTTPException(status_code=400, detail="Invalid export cursor.")
            records_query = records_query.start_after(cursor_snapshot)

        documents = list(records_query.limit(page_size + 1).stream())
        has_more = len(documents) > page_size
        documents = documents[:page_size]
        next_cursor = documents[-1].id if has_more else None
        response = {"records": [doc.to_dict() for doc in documents]}
        if next_cursor:
            response["next_cursor"] = next_cursor
        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error exporting data: {str(e)}",
        ) from e
