import os
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from firebase_admin import storage

from database import db

app = FastAPI(title="MedReach AI Backend", version="1.0")


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

    original_filename = os.path.basename(file.filename.replace("\\", "/"))
    if not original_filename:
        raise HTTPException(status_code=400, detail="Invalid file name.")

    upload_id = str(uuid4())
    storage_path = f"companies/{company_id}/uploads/{upload_id}_{original_filename}"
    file_bytes = await file.read()

    bucket = storage.bucket()
    blob = bucket.blob(storage_path)
    blob.upload_from_string(
        file_bytes,
        content_type=file.content_type or "application/octet-stream",
    )

    return {"upload_id": upload_id, "storage_path": storage_path}