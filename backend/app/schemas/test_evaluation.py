"""
Pydantic schemas for test evaluation API.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime


class QuestionPaperCreate(BaseModel):
    """Schema for creating a question paper."""
    test_title: str = Field(..., min_length=1, max_length=200)
    test_type: str = Field(..., description="Type: development, testing, devops, etc.")
    total_marks: float = Field(..., gt=0, description="Total marks for the test")
    duration_minutes: Optional[int] = Field(None, gt=0, description="Test duration in minutes")
    model: Optional[str] = Field(None, description="LLM model to use for processing")


class QuestionSchema(BaseModel):
    """Schema for a single question."""
    question: str
    answer: str
    marks: float
    type: str = "descriptive"
    difficulty: str = "medium"
    topics: List[str] = []


class QuestionPaperResponse(BaseModel):
    """Schema for question paper response."""
    test_id: str
    title: str
    extracted_text: str
    questions: List[QuestionSchema]
    total_questions: int
    total_marks: float
    file_info: Dict[str, Any]
    metadata: Dict[str, Any]


class AnswerSheetUpload(BaseModel):
    """Schema for answer sheet upload."""
    test_id: str
    candidate_name: str = Field(..., min_length=1, max_length=100)
    candidate_email: Optional[EmailStr] = None
    model: Optional[str] = Field(None, description="LLM model to use for evaluation")


class AnswerEvaluationDetail(BaseModel):
    """Schema for individual answer evaluation."""
    question_number: int
    question: str
    candidate_answer: str
    marks_awarded: float
    max_marks: float
    feedback: str
    percentage: float


class AnswerSheetResponse(BaseModel):
    """Schema for answer sheet evaluation response."""
    answer_sheet_id: str
    candidate_name: str
    test_id: str
    total_marks_obtained: float
    total_marks: float
    percentage: float
    evaluations: List[AnswerEvaluationDetail]
    file_info: Dict[str, Any]
    summary: Dict[str, Any]


class TestResultSchema(BaseModel):
    """Schema for test result."""
    id: str
    candidate_name: str
    candidate_email: Optional[str]
    total_marks_obtained: Optional[float]
    percentage: Optional[float]
    status: str
    submitted_at: Optional[datetime]


class TestResultsResponse(BaseModel):
    """Schema for test results response."""
    test_id: str
    results: List[TestResultSchema]
    total: int


class TestStatistics(BaseModel):
    """Schema for test statistics."""
    test_id: str
    total_submissions: int
    average_percentage: float
    highest_score: float
    lowest_score: float
    pass_rate: float
    passed_count: int
    failed_count: int


class QuestionDetail(BaseModel):
    """Schema for detailed question information."""
    id: str
    test_id: str
    question_number: int
    question_text: str
    correct_answer: str
    marks: float
    question_type: str
    metadata: Optional[Dict[str, Any]]


class TestDetail(BaseModel):
    """Schema for detailed test information."""
    id: str
    title: str
    test_type: str
    total_marks: float
    duration_minutes: Optional[int]
    question_paper_path: str
    question_paper_name: str
    created_by: str
    created_at: datetime
    metadata: Dict[str, Any]
    questions: Optional[List[QuestionDetail]] = None


class EvaluationDetailResponse(BaseModel):
    """Schema for detailed evaluation of a single answer sheet."""
    answer_sheet_id: str
    test_id: str
    candidate_name: str
    candidate_email: Optional[str]
    total_marks_obtained: float
    total_marks: float
    percentage: float
    status: str
    submitted_at: Optional[datetime]
    evaluations: List[Dict[str, Any]]


class ErrorResponse(BaseModel):
    """Schema for error responses."""
    error: str
    detail: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
