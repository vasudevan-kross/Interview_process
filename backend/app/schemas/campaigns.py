"""
Pydantic schemas for Hiring Campaigns API
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from uuid import UUID


# ============================================================================
# Campaign Slot Schema
# ============================================================================

class CampaignSlot(BaseModel):
    """Represents a time slot for interviews (morning, evening, etc.)"""
    name: str = Field(..., min_length=1, max_length=100, description="Slot name (e.g., 'Morning Slot')")
    time_start: str = Field(..., description="Start time (HH:MM format, e.g., '09:00')")
    time_end: str = Field(..., description="End time (HH:MM format, e.g., '12:00')")
    description: Optional[str] = Field(None, description="Optional slot description")

    @validator('time_start', 'time_end')
    def validate_time_format(cls, v):
        """Validate HH:MM format"""
        try:
            hours, minutes = v.split(':')
            if not (0 <= int(hours) <= 23 and 0 <= int(minutes) <= 59):
                raise ValueError
        except (ValueError, AttributeError):
            raise ValueError('Time must be in HH:MM format (e.g., "09:00")')
        return v


# ============================================================================
# Campaign Metadata Schema
# ============================================================================

class CampaignMetadata(BaseModel):
    """Campaign metadata including slots and settings"""
    slots: List[CampaignSlot] = Field(default_factory=list, description="Interview slots")
    target_roles: List[str] = Field(default_factory=list, description="Target job roles")
    settings: Dict[str, Any] = Field(default_factory=dict, description="Custom settings")


# ============================================================================
# Campaign Create/Update Schemas
# ============================================================================

class CampaignCreate(BaseModel):
    """Schema for creating a new campaign"""
    name: str = Field(..., min_length=1, max_length=255, description="Campaign name")
    description: Optional[str] = Field(None, description="Campaign description")
    metadata: Optional[CampaignMetadata] = Field(
        default_factory=lambda: CampaignMetadata(slots=[], target_roles=[], settings={}),
        description="Campaign metadata"
    )


class CampaignUpdate(BaseModel):
    """Schema for updating an existing campaign"""
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Campaign name")
    description: Optional[str] = Field(None, description="Campaign description")
    status: Optional[str] = Field(None, description="Campaign status: active, completed, archived")
    metadata: Optional[CampaignMetadata] = Field(None, description="Campaign metadata")

    @validator('status')
    def validate_status(cls, v):
        """Validate status is one of allowed values"""
        if v and v not in ['active', 'completed', 'archived']:
            raise ValueError('Status must be one of: active, completed, archived')
        return v


# ============================================================================
# Campaign Response Schema
# ============================================================================

class CampaignResponse(BaseModel):
    """Schema for campaign response"""
    id: UUID
    org_id: UUID
    name: str
    description: Optional[str]
    status: str
    metadata: Dict[str, Any]  # Will contain slots, target_roles, settings
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CampaignWithStats(CampaignResponse):
    """Campaign with statistics"""
    statistics: Optional[Dict[str, Any]] = None


class CampaignListResponse(BaseModel):
    """Schema for list of campaigns"""
    campaigns: List[CampaignWithStats]
    total: int


# ============================================================================
# Candidate Import Schemas
# ============================================================================

class CandidateImportRow(BaseModel):
    """Single candidate row from Excel import"""
    email: str = Field(..., description="Candidate email")
    name: str = Field(..., description="Candidate name")
    phone: Optional[str] = Field(None, description="Candidate phone")
    job_role: Optional[str] = Field(None, description="Job role/title to match with JD")
    slot: Optional[str] = Field(None, description="Interview slot name")
    notes: Optional[str] = Field(None, description="Additional notes")


class CandidateImportPreview(BaseModel):
    """Preview of candidates to be imported"""
    total_rows: int
    valid_rows: int
    invalid_rows: int
    candidates: List[CandidateImportRow]
    job_mappings: Dict[str, Optional[UUID]] = Field(
        default_factory=dict,
        description="Map of job_role -> job_description_id"
    )
    slot_mappings: Dict[str, Optional[str]] = Field(
        default_factory=dict,
        description="Map of slot name -> slot name from campaign"
    )
    errors: List[str] = Field(default_factory=list, description="Validation errors")


class CandidateImportRequest(BaseModel):
    """Request to import candidates after preview"""
    candidates: List[CandidateImportRow]
    job_mappings: Dict[str, str] = Field(
        ...,
        description="Map of job_role -> job_description_id (UUID as string)"
    )
    slot_mappings: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of Excel slot name -> campaign slot name"
    )


class CandidateImportResponse(BaseModel):
    """Response after importing candidates"""
    success: bool
    imported_count: int
    skipped_count: int
    errors: List[str] = Field(default_factory=list)
    candidate_ids: List[UUID] = Field(default_factory=list)


# ============================================================================
# Pipeline Candidate Schemas (Enhanced)
# ============================================================================

class InterviewSlot(BaseModel):
    """Interview slot assignment for a candidate"""
    slot_name: str = Field(..., description="Slot name from campaign")
    scheduled_date: Optional[str] = Field(None, description="Scheduled date (YYYY-MM-DD)")
    time_window: Optional[str] = Field(None, description="Time window (e.g., '09:00-12:00')")
    coding_interview_id: Optional[UUID] = Field(None, description="Linked coding interview ID")


class PipelineCandidateCreate(BaseModel):
    """Schema for creating a pipeline candidate"""
    campaign_id: Optional[UUID] = Field(None, description="Campaign ID")
    job_id: UUID = Field(..., description="Job description ID")
    candidate_name: str = Field(..., min_length=1, description="Candidate name")
    candidate_email: str = Field(..., description="Candidate email")
    candidate_phone: Optional[str] = Field(None, description="Candidate phone")
    interview_slot: Optional[InterviewSlot] = Field(None, description="Interview slot assignment")
    current_stage: str = Field(
        default='resume_screening',
        description="Initial stage"
    )


class PipelineCandidateUpdate(BaseModel):
    """Schema for updating a pipeline candidate"""
    campaign_id: Optional[UUID] = None
    job_id: Optional[UUID] = None
    current_stage: Optional[str] = None
    interview_slot: Optional[InterviewSlot] = None
    final_decision: Optional[str] = None
    decision_notes: Optional[str] = None


class PipelineCandidateResponse(BaseModel):
    """Schema for pipeline candidate response"""
    id: UUID
    campaign_id: Optional[UUID]
    job_id: UUID
    org_id: UUID
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str]
    current_stage: str
    skipped_stages: List[str]
    interview_slot: Optional[Dict[str, Any]]
    resume_id: Optional[UUID]
    coding_submission_id: Optional[UUID]
    voice_candidate_id: Optional[UUID]
    resume_match_score: Optional[float]
    coding_score: Optional[float]
    coding_percentage: Optional[float]
    voice_status: Optional[str]
    recommendation: str
    final_decision: str
    decision_notes: Optional[str]
    decided_by: Optional[UUID]
    decided_at: Optional[datetime]
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Campaign Analytics Schemas
# ============================================================================

class CampaignAnalytics(BaseModel):
    """Campaign analytics and statistics"""
    campaign_id: UUID
    total_candidates: int
    by_stage: Dict[str, int]
    by_decision: Dict[str, int]
    by_recommendation: Dict[str, int]
    unique_jobs: int
    avg_resume_score: Optional[float]
    avg_coding_score: Optional[float]


class CampaignCandidatesSummary(BaseModel):
    """Summary of candidates by job"""
    job_title: str
    total_count: int
    resume_screening_count: int
    technical_assessment_count: int
    voice_screening_count: int
    completed_count: int
