from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from database import db

app = FastAPI(title="MedReach AI Backend", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Verify the server is running and the database is accessible."""
    try:
        list(db.collections())
        return {"status": "healthy", "database": "emulator_connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


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
