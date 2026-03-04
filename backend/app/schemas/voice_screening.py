"""Pydantic schemas for voice screening API - Clean, flexible schema."""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class InterviewPersona(str, Enum):
    """Interview persona/tone options."""
    PROFESSIONAL = "professional"
    CASUAL = "casual"
    TECHNICAL = "technical"


class CandidateType(str, Enum):
    """Candidate experience level."""
    FRESHER = "fresher"
    EXPERIENCED = "experienced"
    GENERAL = "general"


class InterviewStyle(str, Enum):
    """Interview conversation style."""
    STRUCTURED = "structured"  # Fixed questions in order
    ADAPTIVE = "adaptive"  # Follow-up questions based on answers
    CONVERSATIONAL = "conversational"  # Dynamic, natural conversation


class CallStatus(str, Enum):
    """Call status options."""
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    NO_ANSWER = "no_answer"
    BUSY = "busy"


class CandidateStatus(str, Enum):
    """Candidate interview status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# CAMPAIGN SCHEMAS
# ============================================================================

class CampaignCreateRequest(BaseModel):
    """Schema for creating a voice screening campaign."""
    name: str = Field(..., min_length=1, max_length=200, description="Campaign name")
    job_role: str = Field(..., min_length=1, max_length=100, description="Job role/title")
    description: Optional[str] = Field(None, description="Campaign description")

    # Job context (for AI)
    job_description_text: Optional[str] = Field(None, description="Full job description for AI context")
    technical_requirements: Optional[str] = Field(None, description="Technical skills/requirements")

    # Interview configuration
    custom_questions: List[str] = Field(default_factory=list, max_items=20, description="Interview questions")
    required_fields: List[str] = Field(default_factory=list, max_items=30, description="Fields to extract dynamically")
    interview_persona: InterviewPersona = Field(default=InterviewPersona.PROFESSIONAL, description="Interview tone")
    candidate_type: CandidateType = Field(default=CandidateType.GENERAL, description="Target candidate level")
    interview_style: InterviewStyle = Field(default=InterviewStyle.CONVERSATIONAL, description="Conversation style")

    # VAPI knowledge base (file IDs from VAPI file upload)
    knowledge_base_file_ids: List[str] = Field(default_factory=list, description="VAPI file IDs for knowledge base")


class CampaignResponse(BaseModel):
    """Schema for campaign response."""
    id: str
    created_at: str
    updated_at: Optional[str] = None
    created_by: Optional[str] = None

    # Campaign metadata
    name: str
    job_role: str
    description: Optional[str] = None
    is_active: bool

    # Job context
    job_description_text: Optional[str] = None
    technical_requirements: Optional[str] = None

    # Configuration
    custom_questions: List[str]
    required_fields: List[str]
    interview_persona: str
    candidate_type: str
    interview_style: str

    # AI-generated
    generated_system_prompt: str
    generated_schema: Dict[str, Any]
    vapi_config: Dict[str, Any]

    # VAPI integration
    knowledge_base_file_ids: List[str]
    vapi_functions: List[Dict[str, Any]]

    # Tracking
    generation_model: Optional[str] = None
    generation_metadata: Optional[Dict[str, Any]] = None


class GeneratedPromptResponse(BaseModel):
    """Schema for AI-generated prompt configuration."""
    system_prompt: str
    structured_data_schema: Dict[str, Any]
    expected_questions: List[str]
    conversation_flow: str


# ============================================================================
# CANDIDATE SCHEMAS
# ============================================================================

class VoiceCandidateCreate(BaseModel):
    """Schema for creating a single voice screening candidate."""
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    campaign_id: str = Field(..., description="Campaign ID (required)")


class VoiceCandidateBulkCreate(BaseModel):
    """Schema for bulk creating voice candidates."""
    campaign_id: str = Field(..., description="Campaign ID for all candidates")
    candidates: List[Dict[str, str]] = Field(..., description="List of candidates with name, email, phone")


class VoiceCandidateUpdate(BaseModel):
    """Schema for updating a voice candidate."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None


class VoiceCandidateResponse(BaseModel):
    """Schema for voice candidate response (minimal, clean)."""
    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None

    # Campaign
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None  # Joined from voice_screening_campaigns

    # Identity
    interview_token: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None

    # Status
    status: str
    latest_call_id: Optional[str] = None

    # Notes
    recruiter_notes: Optional[str] = None

    # VAPI Configuration (from campaign)
    vapi_config: Optional[Dict[str, Any]] = None


# ============================================================================
# CALL HISTORY SCHEMAS
# ============================================================================

class CallHistoryResponse(BaseModel):
    """Schema for call history response."""
    id: str
    created_at: str
    updated_at: Optional[str] = None

    # Call info
    candidate_id: str
    call_id: str
    status: str

    # Timing
    started_at: str
    ended_at: Optional[str] = None
    duration_seconds: Optional[int] = None

    # Content
    transcript: Optional[str] = None
    recording_url: Optional[str] = None

    # Extracted data (dynamic per campaign)
    structured_data: Dict[str, Any]

    # AI-generated analysis
    interview_summary: Optional[str] = None
    key_points: List[str]
    technical_assessment: Dict[str, Any]

    # Metadata
    call_type: str
    initiated_by: Optional[str] = None
    notes: Optional[str] = None

    # VAPI
    vapi_cost_cents: Optional[int] = None
    vapi_duration_minutes: Optional[float] = None
    vapi_metadata: Dict[str, Any]


class TechnicalAssessment(BaseModel):
    """Schema for technical assessment structure."""
    skills_mentioned: List[str] = Field(default_factory=list)
    experience_level: Optional[str] = None  # Junior/Mid/Senior
    years_experience: Optional[str] = None
    tech_stack_match_percentage: Optional[int] = None
    strengths: List[str] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = None  # Strong Yes / Yes / Maybe / No
    hiring_decision_confidence: Optional[str] = None  # High / Medium / Low


# ============================================================================
# VAPI INTEGRATION SCHEMAS
# ============================================================================

class VapiFileUploadResponse(BaseModel):
    """Schema for VAPI file upload response."""
    file_id: str
    name: str
    status: str  # 'indexed', 'processing', 'failed'


class VapiFunctionDefinition(BaseModel):
    """Schema for VAPI function calling definition."""
    name: str
    description: str
    parameters: Dict[str, Any]


class VoiceWebhookPayload(BaseModel):
    """Schema for Vapi webhook end-of-call report."""
    message: Optional[dict] = None

    class Config:
        extra = "allow"


# ============================================================================
# QUESTION GENERATION SCHEMAS
# ============================================================================

class QuestionGenerationRequest(BaseModel):
    """Schema for AI question generation request."""
    job_role: str = Field(..., min_length=1, max_length=200, description="Job role to generate questions for")
    candidate_type: CandidateType = Field(default=CandidateType.GENERAL, description="Type of candidate")
    num_questions: int = Field(default=5, ge=1, le=20, description="Number of questions to generate")
    job_description_text: Optional[str] = Field(None, description="Job description for context")
    technical_requirements: Optional[str] = Field(None, description="Technical requirements for context")
    question_basis: Optional[List[str]] = Field(default=None, description="Basis for questions (job_description, technical_requirements, job_role, knowledge_base)")
    enable_adaptive_questioning: Optional[bool] = Field(default=True, description="Enable adaptive follow-up questions based on candidate responses")
    focus_areas: Optional[List[str]] = Field(default=None, description="Specific focus areas for question generation")


class QuestionGenerationResponse(BaseModel):
    """Schema for AI question generation response."""
    questions: List[str] = Field(..., description="List of generated questions")
    model: str = Field(..., description="Model used for generation")


# ============================================================================
# FETCH CALL DATA SCHEMAS
# ============================================================================

class FetchCallDataRequest(BaseModel):
    """Schema for fetching call data from VAPI."""
    call_id: str = Field(..., description="VAPI call ID")


class FetchCallDataResponse(BaseModel):
    """Schema for fetch call data response."""
    success: bool
    message: str
    call_data: Optional[Dict[str, Any]] = None
    call_history_id: Optional[str] = None
