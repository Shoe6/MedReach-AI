import csv
import io
import os
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from firebase_admin import storage

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
        # Simple read from the local emulator to verify connection
        collections = db.collections()
        return {"status": "healthy", "database": "emulator_connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


@app.post("/api/companies/{company_id}/upload_file", status_code=201)
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