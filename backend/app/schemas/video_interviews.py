"""
Pydantic schemas for video interviews.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class InterviewType(str, Enum):
    """Interview type enum."""
    PANEL = "panel"
    ONE_ON_ONE = "one_on_one"
    TECHNICAL = "technical"


class InterviewStatus(str, Enum):
    """Interview status enum."""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ParticipantRole(str, Enum):
    """Participant role enum."""
    INTERVIEWER = "interviewer"
    OBSERVER = "observer"
    CANDIDATE = "candidate"


class Recommendation(str, Enum):
    """Interview recommendation enum."""
    STRONG_HIRE = "strong_hire"
    HIRE = "hire"
    MAYBE = "maybe"
    NO_HIRE = "no_hire"
    STRONG_NO_HIRE = "strong_no_hire"


# Request Schemas

class InterviewerCreate(BaseModel):
    """Schema for adding an interviewer to an interview."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    user_id: Optional[str] = None


class QuestionCreate(BaseModel):
    """Schema for creating an interview question."""
    text: str = Field(..., min_length=1, alias="question_text")
    type: str = Field(default="technical", alias="question_type")
    difficulty: Optional[str] = None
    duration: Optional[int] = Field(default=10, alias="expected_duration_minutes")
    skills_assessed: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    code_template: Optional[str] = None
    test_cases: List[dict] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class ScheduleInterviewRequest(BaseModel):
    """Schema for scheduling a video interview."""
    job_id: str = Field(..., alias="job_description_id")
    candidate_email: EmailStr
    candidate_name: str = Field(..., min_length=1, max_length=255)
    resume_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)  # 15 min to 8 hours
    interviewers: List[InterviewerCreate] = Field(..., min_items=1)
    questions: Optional[List[QuestionCreate]] = None
    interview_type: InterviewType = Field(default=InterviewType.PANEL)

    class Config:
        populate_by_name = True


class UpdateInterviewRequest(BaseModel):
    """Schema for updating an interview."""
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=15, le=480)
    status: Optional[InterviewStatus] = None
    description: Optional[str] = None


class AddParticipantRequest(BaseModel):
    """Schema for adding a participant to an interview."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: ParticipantRole = Field(default=ParticipantRole.INTERVIEWER)
    user_id: Optional[str] = None


class CreateEvaluationRequest(BaseModel):
    """Schema for creating an interview evaluation."""
    overall_score: float = Field(..., ge=0, le=100)
    communication_score: Optional[float] = Field(default=None, ge=0, le=100)
    technical_score: Optional[float] = Field(default=None, ge=0, le=100)
    problem_solving_score: Optional[float] = Field(default=None, ge=0, le=100)
    cultural_fit_score: Optional[float] = Field(default=None, ge=0, le=100)
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    key_highlights: Optional[str] = None
    concerns: Optional[str] = None
    recommendation: Recommendation
    next_steps: Optional[str] = None


class SessionStartedWebhook(BaseModel):
    """Schema for 100ms session started webhook."""
    room_id: str
    session_id: str
    timestamp: datetime


class SessionEndedWebhook(BaseModel):
    """Schema for 100ms session ended webhook."""
    room_id: str
    session_id: str
    duration: int  # in seconds
    participants: List[dict] = Field(default_factory=list)


class RecordingReadyWebhook(BaseModel):
    """Schema for 100ms recording ready webhook."""
    room_id: str
    recording_id: str
    download_url: str
    duration: int  # in seconds


# Response Schemas

class ParticipantResponse(BaseModel):
    """Schema for participant response."""
    id: str
    video_interview_id: str
    name: str
    email: str
    role: str
    join_url: Optional[str] = None
    joined_at: Optional[datetime] = None
    left_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class QuestionResponse(BaseModel):
    """Schema for question response."""
    id: str
    video_interview_id: str
    question_number: int
    question_text: str
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    expected_duration_minutes: Optional[int] = None
    skills_assessed: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    created_at: datetime

    class Config:
        from_attributes = True


class EvaluationResponse(BaseModel):
    """Schema for evaluation response."""
    id: str
    video_interview_id: str
    evaluator_id: Optional[str] = None
    evaluation_type: str
    overall_score: Optional[float] = None
    communication_score: Optional[float] = None
    technical_score: Optional[float] = None
    problem_solving_score: Optional[float] = None
    cultural_fit_score: Optional[float] = None
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    key_highlights: Optional[str] = None
    concerns: Optional[str] = None
    recommendation: Optional[str] = None
    next_steps: Optional[str] = None
    ai_sentiment_score: Optional[float] = None
    ai_confidence: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InterviewResponse(BaseModel):
    """Schema for interview response."""
    id: str
    job_description_id: str
    resume_id: Optional[str] = None
    candidate_email: str
    candidate_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    interview_type: str
    status: str
    scheduled_at: datetime
    duration_minutes: int
    room_id: Optional[str] = None
    room_name: Optional[str] = None
    recording_path: Optional[str] = None
    recording_duration_seconds: Optional[int] = None
    transcript_text: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class ScheduleInterviewResponse(BaseModel):
    """Schema for schedule interview response."""
    interview_id: str
    room_id: str
    room_name: str
    scheduled_at: str
    duration_minutes: int
    candidate_join_url: str
    interviewer_join_urls: List[dict]
    total_participants: int


class InterviewListResponse(BaseModel):
    """Schema for interview list response."""
    interviews: List[InterviewResponse]
    total: int
    page: int
    page_size: int


class InterviewDetailsResponse(InterviewResponse):
    """Schema for detailed interview response with related data."""
    participants: List[ParticipantResponse] = Field(default_factory=list)
    questions: List[QuestionResponse] = Field(default_factory=list)
    evaluations: List[EvaluationResponse] = Field(default_factory=list)
