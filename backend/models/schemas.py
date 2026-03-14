"""Pydantic models for request/response validation."""

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime


# ─── Profiles ───────────────────────────────────────────────────────────────

class ProfileCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    daily_email_enabled: Optional[bool] = None

class Profile(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    daily_email_enabled: bool
    created_at: datetime


# ─── Keywords ───────────────────────────────────────────────────────────────

class KeywordCreate(BaseModel):
    keyword: str
    category: str = "leistung"  # 'leistung' | 'allgemein' | 'firma'

class KeywordApprove(BaseModel):
    keyword_ids: List[str]

class Keyword(BaseModel):
    id: str
    profile_id: str
    keyword: str
    category: str
    source: str
    approved: bool
    created_at: datetime


# ─── Tenders ────────────────────────────────────────────────────────────────

class TenderSummary(BaseModel):
    id: str
    external_id: str
    platform: str
    title: str
    client: Optional[str]
    deadline: Optional[date]
    publication_date: Optional[date]
    summary: Optional[str]
    url: Optional[str]
    pdf_url: Optional[str]
    # Joined from tender_scores
    score: Optional[int] = None
    matched_keywords: Optional[List[str]] = None
    # Joined from tender_status
    status: Optional[str] = None


class TenderDetail(TenderSummary):
    description: Optional[str]


class TenderStatusUpdate(BaseModel):
    status: str               # 'interested' | 'working_on' | 'dismissed'
    profile_id: Optional[str] = None
    notes: Optional[str] = None


# ─── Dashboard ──────────────────────────────────────────────────────────────

class DashboardResponse(BaseModel):
    working_on: List[TenderSummary]
    interested: List[TenderSummary]
    recent_tenders: List[TenderSummary]
    last_scrape_at: Optional[datetime]
    last_scrape_status: Optional[str]


# ─── PDF Uploads ─────────────────────────────────────────────────────────────

class ExtractedKeyword(BaseModel):
    keyword: str
    category: str
    approved: bool = False

class PDFUploadResponse(BaseModel):
    upload_id: str
    filename: str
    extracted_keywords: List[ExtractedKeyword]
    status: str

class KeywordApprovalRequest(BaseModel):
    keywords: List[ExtractedKeyword]  # only the ones the user approved


# ─── Email Recipients ───────────────────────────────────────────────────────

class EmailRecipientCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class EmailRecipient(BaseModel):
    id: str
    profile_id: str
    email: str
    name: Optional[str]
    created_at: datetime
