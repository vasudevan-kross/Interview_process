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


class StartSubmissionRequest(BaseModel):
    """Schema for starting a submission."""
    candidate_name: str
    candidate_email: EmailStr
    candidate_phone: Optional[str] = None
    preferred_language: Optional[str] = None  # Candidate's chosen language from allowed_languages


class SaveCodeRequest(BaseModel):
    """Schema for auto-saving code."""
    submission_id: str
    question_id: str
    code: str
    programming_language: str


class SubmitInterviewRequest(BaseModel):
    """Schema for submitting interview."""
    submission_id: str
    signature_data: Optional[str] = None  # Base64 encoded signature
    terms_accepted: bool = False  # Whether terms were accepted


class TrackActivityRequest(BaseModel):
    """Schema for tracking activity."""
    submission_id: str
    activity_type: str
    question_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
