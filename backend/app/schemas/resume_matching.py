"""
Pydantic schemas for resume matching API.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


class JobDescriptionCreate(BaseModel):
    """Schema for creating a job description."""
    title: str = Field(..., min_length=1, max_length=200)
    department: Optional[str] = Field(None, max_length=100)
    model: Optional[str] = Field(None, description="LLM model to use for processing")


class JobDescriptionResponse(BaseModel):
    """Schema for job description response."""
    job_id: str
    title: str
    extracted_text: str
    skills: Optional[Dict[str, Any]] = None
    file_info: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    # LLM service fields
    required_skills: Optional[List[str]] = None
    total_skills: Optional[int] = None
    department: Optional[str] = None


class ResumeUpload(BaseModel):
    """Schema for resume upload."""
    job_id: str
    candidate_name: Optional[str] = Field(None, max_length=100)
    candidate_email: Optional[EmailStr] = None
    model: Optional[str] = Field(None, description="LLM model to use for processing")


class ResumeResponse(BaseModel):
    """Schema for resume processing response."""
    resume_id: str
    candidate_name: Optional[str]
    extracted_text: str
    skills: Optional[Dict[str, Any]] = None
    match_score: float
    match_details: Optional[Dict[str, Any]] = None
    file_info: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    candidate_email: Optional[str] = None


class BatchResumeResponse(BaseModel):
    """Schema for batch resume processing response."""
    total_processed: int
    total_failed: int
    results: List[ResumeResponse]
    failed: List[Dict[str, Optional[str]]]
    top_candidates: List[ResumeResponse]
    summary: Dict[str, float]


class CandidateInfo(BaseModel):
    """Schema for candidate information."""
    id: str
    candidate_name: str
    candidate_email: Optional[str]
    match_score: Optional[float]
    match_details: Optional[Dict[str, Any]]
    skills_extracted: Dict[str, List[str]]
    recommendation: Optional[str] = None
    overall_assessment: Optional[str] = None
    experience_match: Optional[str] = None
    key_matches: List[str] = []
    missing_requirements: List[str] = []
    created_at: datetime


class RankedCandidatesResponse(BaseModel):
    """Schema for ranked candidates response."""
    job_id: str
    candidates: List[CandidateInfo]
    total: int


class JobStatistics(BaseModel):
    """Schema for job statistics."""
    job_id: str
    total_resumes: int
    average_score: float
    top_score: float
    lowest_score: float
    score_distribution: Dict[str, int]


class SkillsExtractionRequest(BaseModel):
    """Schema for skills extraction request."""
    text: str = Field(..., min_length=50)
    model: Optional[str] = None


class SkillsExtractionResponse(BaseModel):
    """Schema for skills extraction response."""
    skills: Dict[str, List[str]]
    model_used: str
    extraction_metadata: Dict[str, Any]


class MatchScoreRequest(BaseModel):
    """Schema for match score calculation request."""
    job_description: str = Field(..., min_length=50)
    resume: str = Field(..., min_length=50)
    model: Optional[str] = None


class MatchScoreResponse(BaseModel):
    """Schema for match score response."""
    match_score: float
    key_matches: List[str]
    missing_requirements: List[str]
    reasoning: str
    model_used: str
    evaluation_metadata: Dict[str, Any]


class ErrorResponse(BaseModel):
    """Schema for error responses."""
    error: str
    detail: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
