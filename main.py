import csv
import io
import os
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from firebase_admin import storage

from datetime import datetime
from database import db
from ingestion import ingest_csv_chunks

app = FastAPI(title="MedReach AI Backend", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        total_hcps          – total HCP records across all company collections
        health_score        – company-wide average data health score (0-100)
        records_this_week   – records ingested in the last 7 days
        unresolved_flags    – dict with counts per category (pii, duplicates,
                              outliers, npi_validation) and a total
        last_upload         – ISO timestamp of the most recent upload document
    """
    try:
        # ── Total HCP records ────────────────────────────────────────────────
        total_hcps = 0
        records_this_week = 0
        health_scores: list[float] = []
        last_upload_ts: str | None = None

        from datetime import timedelta, timezone
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        # Walk every company → uploads subcollection
        companies_ref = db.collection("companies")
        for company_doc in companies_ref.stream():
            uploads_ref = company_doc.reference.collection("uploads")
            for upload_doc in uploads_ref.stream():
                data = upload_doc.to_dict() or {}
                rows = int(data.get("total_rows", 0))
                total_hcps += rows

                # Track health scores
                score = data.get("health_score")
                if score is not None:
                    health_scores.append(float(score))

                # Recent uploads
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

        # ── Unresolved flag counts ────────────────────────────────────────────
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

        # ── Fallback: if Firestore is empty, return seeded demo values ────────
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
        # Non-fatal: return demo seed so the UI never breaks
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


@app.post("/api/export/log")
async def log_export(payload: ExportLogPayload):
    """Write an export event to Firestore exports collection."""
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
async def upload_company_file(company_id: str, file: UploadFile = File(...)):
    """Upload a file for a specific company tenant and return its upload metadata."""
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

    ingestion_summary = ingest_csv_chunks(io.BytesIO(file_bytes))

    bucket = storage.bucket()
    blob = bucket.blob(storage_path)
    blob.upload_from_string(
        file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

    return {
        "upload_id": upload_id,
        "storage_path": storage_path,
        "total_rows": ingestion_summary["total_rows"],
        "columns": ingestion_summary["columns"],
        "preview_data": ingestion_summary["preview_data"],
        "inferred_schema": ingestion_summary["inferred_schema"],
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


@app.get("/api/companies/{company_id}/export_data")
async def export_company_data(company_id: str):
    """
    Export processed records for a company as a CRM-compatible CSV.
    
    HIPAA COMPLIANCE: Only records with Has_Opted_In=true are included.
    Filters out any rows where Has_Opted_In is missing, false, or null.
    """
    try:
        # Fetch all records from the company's records collection
        records_ref = db.collection("companies").document(company_id).collection("records")
        docs = records_ref.stream()
        
        records = []
        for doc in docs:
            records.append(doc.to_dict())
        
        if not records:
            raise HTTPException(
                status_code=404,
                detail=f"No records found for company {company_id}",
            )
        
        # Load into pandas DataFrame
        df = pd.DataFrame(records)
        
        # CRITICAL HIPAA COMPLIANCE: Filter for opted-in records only
        # Only keep rows where Has_Opted_In is explicitly True
        if "Has_Opted_In" in df.columns:
            # Convert to boolean, treating None/NaN/False as non-opted-in
            df = df[df["Has_Opted_In"] == True]  # noqa: E712
        else:
            # If the column doesn't exist, no records can be included
            df = df.iloc[0:0]  # Empty dataframe with same structure
        
        if df.empty:
            raise HTTPException(
                status_code=200,
                detail="No opted-in records available for export",
            )
        
        # Standardize the dataframe for CRM ingestion
        # Replace NaN with empty strings
        df = df.fillna("")
        
        # Ensure UTF-8 encoding by converting string columns
        for col in df.select_dtypes(include=["object", "string"]).columns:
            df[col] = df[col].astype(str).str.encode("utf-8", errors="replace").str.decode("utf-8")
        
        # Generate CSV in memory
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False, quoting=csv.QUOTE_MINIMAL, encoding="utf-8")
        csv_buffer.seek(0)
        
        # Return as streaming response with proper headers
        return StreamingResponse(
            iter([csv_buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=\"crm_export_{company_id}.csv\""},
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error exporting data: {str(e)}",
        ) from e
