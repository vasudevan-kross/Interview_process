"""Pydantic schemas for coding interviews API."""

from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime


class QuestionCreate(BaseModel):
    """Schema for creating a question."""
    question_text: str
    difficulty: str = 'medium'
    marks: int
    starter_code: Optional[str] = None
    solution_code: Optional[str] = None
    test_cases: Optional[List[Dict[str, Any]]] = None
    topics: Optional[List[str]] = None
    time_estimate_minutes: Optional[int] = None


class InterviewCreate(BaseModel):
    """Schema for creating an interview."""
    title: str
    description: Optional[str] = None
    scheduled_start_time: datetime
    scheduled_end_time: datetime
    programming_language: str = 'python'  # Deprecated: for backward compatibility
    allowed_languages: Optional[List[str]] = None  # None = default to [programming_language], [] = ANY language allowed
    interview_type: str = 'coding'
    grace_period_minutes: int = 15
    resume_required: str = 'mandatory'  # 'mandatory', 'optional', 'disabled'
    bond_terms: Optional[str] = None  # Terms and conditions text
    bond_document_url: Optional[str] = None  # URL to uploaded bond document
    require_signature: bool = False  # Whether signature is required
    bond_years: int = 2  # Number of years for bond
    bond_timing: str = 'before_submission'  # 'before_start' | 'before_submission'
    job_id: Optional[str] = None  # Link to job_descriptions for pipeline
    questions: List[QuestionCreate]


class GenerateQuestionsRequest(BaseModel):
    """Schema for AI question generation request."""
    job_description: str
    difficulty: str = 'medium'
    num_questions: int = Field(default=3, ge=1, le=10)
    programming_language: Optional[str] = 'python'
    test_framework: Optional[str] = None
    interview_type: str = 'coding'
    domain_tool: Optional[str] = None  # Generic tool/dialect field (devops_tool, sql_dialect, etc.)
    existing_questions: Optional[List[str]] = None  # To prevent AI from generating duplicate questions


class StartSubmissionRequest(BaseModel):
    """Schema for starting a submission."""
    candidate_name: str
    candidate_email: EmailStr
    candidate_phone: Optional[str] = None
    preferred_language: Optional[str] = None
    device_info: Optional[Dict[str, Any]] = None


class SaveCodeRequest(BaseModel):
    """Schema for auto-saving code."""
    submission_id: str
    question_id: str
    code: str
    programming_language: str


class SubmitInterviewRequest(BaseModel):
    """Schema for submitting interview."""
    submission_id: str
    signature_data: Optional[str] = None
    terms_accepted: bool = False
    submission_trigger: Optional[str] = None  # 'manual', 'timer', 'auto'
    device_info: Optional[Dict[str, Any]] = None


class TrackActivityRequest(BaseModel):
    """Schema for tracking activity."""
    submission_id: str
    activity_type: str
    question_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class BulkTrackActivityRequest(BaseModel):
    """Schema for bulk tracking of multiple activities."""
    submission_id: str
    activities: List[Dict[str, Any]]  # List of {activity_type, question_id, metadata}


class BulkImportResponse(BaseModel):
    """Response for bulk candidate import."""
    imported: int
    duplicates: int
    candidates: List[Dict[str, Any]]


class InterviewCandidateResponse(BaseModel):
    """Unified candidate record (imported + submitted)."""
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    submitted: bool
    submission_id: Optional[str] = None
    score: Optional[float] = None
    percentage: Optional[float] = None
    decision: str = 'pending'


class CandidateDecisionUpdate(BaseModel):
    """Body for updating decision on a submission."""
    decision: str  # 'advanced' | 'rejected' | 'hold' | 'pending'
    notes: Optional[str] = None


class CandidateUpdate(BaseModel):
    """Body for editing a pre-registered candidate."""
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None


class EvaluatorNotesUpdate(BaseModel):
    """Body for saving evaluator notes and optional score override."""
    notes: Optional[str] = None
    marks_override: Optional[float] = None  # None = keep existing score


class QuestionUpdate(BaseModel):
    """A question being updated (id present = update existing, absent = new)."""
    id: Optional[str] = None
    question_text: str
    difficulty: str = 'medium'
    marks: int
    time_estimate_minutes: Optional[int] = None
    starter_code: Optional[str] = None
    topics: Optional[List[str]] = None


class InterviewUpdate(BaseModel):
    """Body for editing an existing interview (partial update)."""
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None
    grace_period_minutes: Optional[int] = None
    require_signature: Optional[bool] = None
    bond_terms: Optional[str] = None
    bond_years: Optional[int] = None
    bond_timing: Optional[str] = None
    bond_document_url: Optional[str] = None
    questions: Optional[List[QuestionUpdate]] = None


class BulkDecisionRequest(BaseModel):
    """Body for bulk decision on multiple submissions."""
    submission_ids: List[str]
    decision: str  # 'advanced' | 'rejected' | 'hold' | 'pending'


class BulkDeleteCandidatesRequest(BaseModel):
    """Body for bulk deleting pre-registered candidates."""
    candidate_ids: List[str]
