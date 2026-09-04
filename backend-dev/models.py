from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class UploadStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Company(BaseModel):
    id: str = Field(..., description="Tenant-scoped company identifier")
    name: str
    email_domain: str | None = Field(
        None,
        description="Official email domain for the company",
    )
    address: str | None = None
    industry: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    class Config:
        frozen = True


class User(BaseModel):
    id: str = Field(..., description="User document ID")
    company_id: str = Field(..., description="Tenant-scoped company identifier")
    email: EmailStr
    full_name: str
    role: str = Field(
        ...,
        description=("User role within the medical outreach platform"),
    )
    phone: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    class Config:
        frozen = True


class Upload(BaseModel):
    id: str = Field(..., description="Upload document ID")
    company_id: str = Field(..., description="Tenant-scoped company identifier")
    user_id: str = Field(..., description="Owner user ID for the upload")
    file_name: str
    file_type: str | None = None
    upload_date: datetime = Field(default_factory=datetime.utcnow)
    status: UploadStatus = UploadStatus.pending
    processed: bool = False
    metadata: dict[str, Any] | None = None

    class Config:
        frozen = True


class DashboardMetrics(BaseModel):
    """Executive dashboard metrics aggregated for a company."""
    company_id: str = Field(..., description="Tenant-scoped company identifier")
    total_healthcare_professionals: int = Field(
        default=0,
        description="Total count of processed HCP records across all uploads",
    )
    data_health_score: float = Field(
        default=0.0,
        description="Company-wide data quality score (0-100 percentage)",
        ge=0.0,
        le=100.0,
    )
    unresolved_validation_flags: int = Field(
        default=0,
        description="Count of unresolved data validation and quality flags",
    )
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        frozen = True
