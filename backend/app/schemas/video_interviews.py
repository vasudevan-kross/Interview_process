"""Pydantic schemas for video interviews API."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, EmailStr


class VideoInterviewQuestion(BaseModel):
    question_text: str
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    expected_duration_minutes: Optional[int] = None


class VideoInterviewCampaignCreate(BaseModel):
    name: str
    job_role: str
    description: Optional[str] = None
    job_description_text: Optional[str] = None
    interview_style: str = "structured"
    interview_duration_minutes: int = 20
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None
    grace_period_minutes: int = 15
    avatar_config: Optional[Dict[str, Any]] = None
    questions: Optional[List[VideoInterviewQuestion]] = None
    llm_model: str = "qwen2.5:7b"
    num_questions: Optional[int] = 5
    question_difficulty: Optional[str] = "medium"
    question_basis: Optional[List[str]] = None


class VideoInterviewCampaignUpdate(BaseModel):
    name: Optional[str] = None
    job_role: Optional[str] = None
    description: Optional[str] = None
    job_description_text: Optional[str] = None
    interview_style: Optional[str] = None
    interview_duration_minutes: Optional[int] = None
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None
    grace_period_minutes: Optional[int] = None
    avatar_config: Optional[Dict[str, Any]] = None
    questions: Optional[List[VideoInterviewQuestion]] = None
    is_active: Optional[bool] = None
    llm_model: Optional[str] = None


class VideoInterviewCampaignResponse(BaseModel):
    id: str
    org_id: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    name: str
    job_role: str
    description: Optional[str] = None
    job_description_text: Optional[str] = None
    interview_style: str
    interview_duration_minutes: int
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None
    grace_period_minutes: int
    avatar_config: Dict[str, Any] = Field(default_factory=dict)
    questions: List[VideoInterviewQuestion] = Field(default_factory=list)
    llm_model: Optional[str] = None
    is_active: bool
    candidate_count: int = 0


class VideoInterviewCandidateCreate(BaseModel):
    campaign_id: str
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class VideoInterviewCandidateResponse(BaseModel):
    id: str
    org_id: str
    campaign_id: str
    interview_token: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str
    latest_session_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    recruiter_notes: Optional[str] = None


class VideoInterviewCandidatePublic(BaseModel):
    id: str
    interview_token: str
    name: str
    status: str
    campaign_id: str
    campaign_name: str
    job_role: str
    interview_duration_minutes: int
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None
    grace_period_minutes: int
    avatar_config: Dict[str, Any] = Field(default_factory=dict)
    questions: List[VideoInterviewQuestion] = Field(default_factory=list)


class VideoInterviewSessionStartResponse(BaseModel):
    session_id: str
    campaign_id: str
    candidate_id: str
    questions: List[VideoInterviewQuestion]
    current_question: Optional[VideoInterviewQuestion] = None
    interview_duration_minutes: int
    avatar_config: Dict[str, Any] = Field(default_factory=dict)
    audio_base64: Optional[str] = None
    audio_content_type: Optional[str] = None


class VideoInterviewTurnRequest(BaseModel):
    session_id: str
    answer_text: str


class VideoInterviewTurnResponse(BaseModel):
    session_id: str
    next_question: Optional[VideoInterviewQuestion] = None
    done: bool
    summary: Optional[str] = None
    evaluation: Optional[Dict[str, Any]] = None


class VideoInterviewAudioTurnResponse(BaseModel):
    session_id: str
    transcript: Optional[str] = None
    next_question: Optional[VideoInterviewQuestion] = None
    done: bool
    summary: Optional[str] = None
    evaluation: Optional[Dict[str, Any]] = None
    speech_detected: bool = True
    audio_base64: Optional[str] = None
    audio_content_type: Optional[str] = None


class VideoInterviewSessionResponse(BaseModel):
    id: str
    campaign_id: str
    candidate_id: str
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    questions: List[VideoInterviewQuestion] = Field(default_factory=list)
    transcript: List[Dict[str, Any]] = Field(default_factory=list)
    interview_summary: Optional[str] = None
    evaluation: Dict[str, Any] = Field(default_factory=dict)
    recording_path: Optional[str] = None
    recording_bucket: Optional[str] = None
    recording_content_type: Optional[str] = None
    recording_duration_seconds: Optional[int] = None
    signed_recording_url: Optional[str] = None
