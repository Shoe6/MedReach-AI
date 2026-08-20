from firebase_admin import firestore

from database import db
from models import Company, Upload, User


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
