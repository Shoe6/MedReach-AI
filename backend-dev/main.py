from fastapi import FastAPI, HTTPException, Path
from database import db

from crud import create_company, create_upload, create_user, get_dashboard_metrics
from models import Company, Upload, User, DashboardMetrics

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


@app.post("/api/companies", response_model=Company)
async def post_company(company: Company):
    """Create a tenant-scoped company document."""
    doc_ref = await create_company(company)
    if not doc_ref:
        raise HTTPException(status_code=500, detail="Unable to create company")
    return company


@app.post("/api/companies/{company_id}/users", response_model=User)
async def post_user(
    user: User,
    company_id: str = Path(
        ...,
        description="Tenant company identifier",
    ),
):
    """Create a user under the tenant-scoped company path."""
    if user.company_id != company_id:
        raise HTTPException(
            status_code=400,
            detail="Payload company_id must match the path company_id",
        )

    doc_ref = await create_user(user)
    if not doc_ref:
        raise HTTPException(status_code=500, detail="Unable to create user")
    return user


@app.post("/api/companies/{company_id}/uploads", response_model=Upload)
async def post_upload(
    upload: Upload,
    company_id: str = Path(
        ...,
        description="Tenant company identifier",
    ),
):
    """Create an upload under the tenant-scoped company path."""
    if upload.company_id != company_id:
        raise HTTPException(
            status_code=400,
            detail="Payload company_id must match the path company_id",
        )

    doc_ref = await create_upload(upload)
    if not doc_ref:
        raise HTTPException(status_code=500, detail="Unable to create upload")
    return upload


@app.get("/api/companies/{company_id}/dashboard_metrics", response_model=DashboardMetrics)
async def get_company_dashboard_metrics(
    company_id: str = Path(
        ...,
        description="Tenant company identifier",
    ),
):
    """
    Retrieve aggregated dashboard metrics for a company.
    
    Returns metrics including:
    - Total processed healthcare professionals
    - Company-wide data health score (0-100)
    - Count of unresolved validation flags
    """
    try:
        metrics = await get_dashboard_metrics(company_id)
        return metrics
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to retrieve dashboard metrics: {str(e)}",
        )
