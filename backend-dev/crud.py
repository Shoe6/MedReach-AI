from firebase_admin import firestore

from database import db
from models import Company, Upload, User, DashboardMetrics


async def create_company(company: Company) -> firestore.DocumentReference:
    """Write a company document at companies/{companyId}."""
    doc_ref = db.collection("companies").document(company.id)
    doc_ref.set(company.model_dump())
    return doc_ref


async def create_user(user: User) -> firestore.DocumentReference:
    """Write a user document under companies/{companyId}/users/{userId}."""
    if not user.company_id:
        raise ValueError("company_id is required for tenant-scoped user documents")

    user_ref = db.collection("companies").document(user.company_id)
    user_ref = user_ref.collection("users").document(user.id)
    user_ref.set(user.model_dump())
    return user_ref


async def create_upload(upload: Upload) -> firestore.DocumentReference:
    """Write an upload document under companies/{companyId}/uploads/{uploadId}."""
    if not upload.company_id:
        raise ValueError("company_id is required for tenant-scoped upload documents")

    upload_ref = db.collection("companies").document(upload.company_id)
    upload_ref = upload_ref.collection("uploads").document(upload.id)
    upload_ref.set(upload.model_dump())
    return upload_ref


async def get_dashboard_metrics(company_id: str) -> DashboardMetrics:
    """
    Aggregate dashboard metrics for a company.
    
    Queries:
    - Total healthcare professionals across all uploads
    - Company-wide data health score (from metadata or average of uploads)
    - Unresolved validation flags (from metadata or flagged records)
    
    Returns:
        DashboardMetrics: Aggregated metrics for the company
    """
    company_ref = db.collection("companies").document(company_id)
    uploads = [doc.to_dict() or {} for doc in company_ref.collection("uploads").stream()]

    total_hcp = 0
    health_scores = []
    total_flags = 0

    for upload in uploads:
        metadata = upload.get("metadata") or {}
        total_hcp += int(metadata.get("record_count", upload.get("record_count", 0)) or 0)

        health_score = float(
            metadata.get("quality_score", upload.get("quality_score", 0)) or 0
        )
        if health_score > 0:
            health_scores.append(health_score)

        total_flags += int(metadata.get("flag_count", upload.get("flag_count", 0)) or 0)

    company_health_score = sum(health_scores) / len(health_scores) if health_scores else 0.0

    return DashboardMetrics(
        company_id=company_id,
        total_healthcare_professionals=total_hcp,
        data_health_score=round(company_health_score, 1),
        unresolved_validation_flags=total_flags,
    )
