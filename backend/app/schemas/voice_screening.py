"""Pydantic schemas for voice screening API."""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class VoiceCandidateCreate(BaseModel):
    """Schema for creating a single voice screening candidate."""
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_fresher: bool = False


class VoiceCandidateBulkCreate(BaseModel):
    """Schema for bulk creating voice candidates."""
    candidates: List[VoiceCandidateCreate]


class VoiceCandidateResponse(BaseModel):
    """Schema for voice candidate response."""
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    interview_token: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_fresher: bool = False
    status: str = "pending"
    call_id: Optional[str] = None

    # Extracted fields
    gender: Optional[str] = None
    current_work_location: Optional[str] = None
    native_location: Optional[str] = None
    current_employer: Optional[str] = None
    work_type: Optional[str] = None
    employment_type: Optional[str] = None
    current_role: Optional[str] = None
    expertise_in: Optional[str] = None
    total_experience: Optional[str] = None
    certifications: Optional[str] = None
    projects_handled: Optional[str] = None
    current_ctc: Optional[str] = None
    expected_ctc: Optional[str] = None
    notice_period: Optional[str] = None
    serving_notice_period: Optional[str] = None
    tentative_joining_date: Optional[str] = None
    existing_offers: Optional[str] = None
    available_interview_time: Optional[str] = None
    current_team_size: Optional[str] = None
    current_shift_timing: Optional[str] = None
    reason_for_leaving: Optional[str] = None

    # Call data
    transcript: Optional[str] = None
    recording_url: Optional[str] = None


class VoiceWebhookPayload(BaseModel):
    """Schema for Vapi webhook end-of-call report."""
    message: Optional[dict] = None

    class Config:
        extra = "allow"
