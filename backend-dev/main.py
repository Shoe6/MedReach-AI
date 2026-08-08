from fastapi import FastAPI
from database import db

app = FastAPI(title="MedReach AI Backend", version="1.0")


@app.get("/api/health")
async def health_check():
    """Verify the server is running and the database is accessible."""
    try:
        # Simple read from the local emulator to verify connection
        collections = list(db.collections())
        return {
            "status": "healthy",
            "database": "emulator_connected",
            "collection_count": len(collections),
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
