from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Header, Path
from pydantic import BaseModel
from database import db

from crud import create_company, create_upload, create_user, get_dashboard_metrics
from models import Company, Upload, User, DashboardMetrics

app = FastAPI(title="MedReach AI Backend", version="1.0")

ADMIN_ROLES = frozenset({"admin", "super-admin"})
EDITOR_ROLES = frozenset({"editor", "admin", "super-admin"})


def require_admin(x_user_role: str | None = Header(default=None, alias="X-User-Role")) -> str:
    """Ensure only admin-equivalent roles can execute protected operations."""
    normalized = (x_user_role or "").strip().lower()
    if normalized not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Admin role required for this operation. Set X-User-Role to admin.",
        )
    return normalized


def require_editor_or_above(x_user_role: str | None = Header(default=None, alias="X-User-Role")) -> str:
    """Block read-only Viewer roles from data modification/cleaning operations."""
    normalized = (x_user_role or "").strip().lower()
    if normalized not in EDITOR_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Editor role or higher required for this operation. Viewers are read-only.",
        )
    return normalized


class BillingPlanUpdatePayload(BaseModel):
    plan: str
    reason: str | None = None


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
    _admin_role: str = Depends(require_admin),
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


@app.delete("/api/companies/{company_id}/uploads/{upload_id}")
async def delete_company_upload(
    company_id: str = Path(..., description="Tenant company identifier"),
    upload_id: str = Path(..., description="Upload document identifier"),
    admin_role: str = Depends(require_admin),
):
    """Soft-delete a company dataset upload. Admin role is required."""
    upload_ref = db.collection("companies").document(company_id).collection("uploads").document(upload_id)
    snapshot = upload_ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail=f"Upload '{upload_id}' not found")

    upload_ref.set(
        {
            "metadata": {
                "soft_deleted": True,
                "deleted_at": datetime.utcnow().isoformat(),
                "deleted_by_role": admin_role,
            }
        },
        merge=True,
    )
    return {"company_id": company_id, "upload_id": upload_id, "soft_deleted": True}


@app.patch("/api/companies/{company_id}/billing-plan")
async def patch_company_billing_plan(
    payload: BillingPlanUpdatePayload,
    company_id: str = Path(..., description="Tenant company identifier"),
    admin_role: str = Depends(require_admin),
):
    """Update tenant billing plan. Admin role is required."""
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


@app.post("/api/companies/{company_id}/uploads", response_model=Upload)
async def post_upload(
    upload: Upload,
    company_id: str = Path(
        ...,
        description="Tenant company identifier",
    ),
    _role: str = Depends(require_editor_or_above),
):
    """Create an upload under the tenant-scoped company path. Viewers are blocked."""
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
