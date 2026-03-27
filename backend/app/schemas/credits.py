"""
Pydantic schemas for Credit System API
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from uuid import UUID


# ============================================================================
# Credit Balance Schemas
# ============================================================================

class CreditBalanceResponse(BaseModel):
    """Organization credit balance response"""
    org_id: UUID
    balance: int = Field(..., ge=0, description="Current credit balance")
    total_purchased: int = Field(..., ge=0, description="Total credits purchased")
    total_consumed: int = Field(..., ge=0, description="Total credits consumed")
    last_updated: datetime


# ============================================================================
# Transaction Schemas
# ============================================================================

class TransactionType(str):
    """Transaction type enum"""
    PURCHASE = "purchase"
    DEDUCTION = "deduction"
    REFUND = "refund"
    BONUS = "bonus"


class CreditTransactionResponse(BaseModel):
    """Credit transaction response"""
    id: UUID
    org_id: UUID
    type: str  # purchase, deduction, refund, bonus
    amount: int  # positive for purchase/refund, negative for deduction
    balance_after: int

    feature: Optional[str] = None  # resume_matching, coding_interview, voice_screening
    action: Optional[str] = None  # upload, generation, call, summary
    reference_id: Optional[UUID] = None  # links to resume, submission, call, etc.
    notes: Optional[str] = None

    created_at: datetime
    created_by: Optional[UUID] = None

    class Config:
        from_attributes = True


class TransactionHistoryRequest(BaseModel):
    """Request for transaction history with filters"""
    limit: int = Field(50, ge=1, le=200, description="Number of transactions to return")
    offset: int = Field(0, ge=0, description="Pagination offset")
    transaction_type: Optional[str] = Field(None, description="Filter by type (purchase, deduction, refund, bonus)")
    feature: Optional[str] = Field(None, description="Filter by feature")

    @validator("transaction_type")
    def validate_type(cls, v):
        if v and v not in ["purchase", "deduction", "refund", "bonus"]:
            raise ValueError("Invalid transaction type")
        return v

    @validator("feature")
    def validate_feature(cls, v):
        if v and v not in ["resume_matching", "coding_interview", "voice_screening"]:
            raise ValueError("Invalid feature")
        return v


class TransactionHistoryResponse(BaseModel):
    """Transaction history response with pagination"""
    transactions: List[CreditTransactionResponse]
    total: int
    limit: int
    offset: int


# ============================================================================
# Credit Hold Schemas
# ============================================================================

class CreditHoldResponse(BaseModel):
    """Credit hold response"""
    id: UUID
    org_id: UUID
    amount: int
    feature: str
    reference_id: UUID
    status: str  # pending, captured, refunded, expired

    transaction_id: Optional[UUID] = None

    created_at: datetime
    resolved_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# Admin Operations
# ============================================================================

class AddCreditsRequest(BaseModel):
    """Request to add credits to an organization (admin only)"""
    org_id: UUID
    amount: int = Field(..., gt=0, description="Number of credits to add")
    transaction_type: str = Field("purchase", description="Transaction type: purchase or bonus")
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes")

    @validator("transaction_type")
    def validate_type(cls, v):
        if v not in ["purchase", "bonus"]:
            raise ValueError("Transaction type must be 'purchase' or 'bonus'")
        return v


class AddCreditsResponse(BaseModel):
    """Response after adding credits"""
    transaction_id: UUID
    org_id: UUID
    amount: int
    new_balance: int
    message: str


# ============================================================================
# Credit Pricing
# ============================================================================

class CreditPricing(BaseModel):
    """Credit pricing for a specific feature/action"""
    feature: str
    action: str
    credits: int
    description: Optional[str] = None


class CreditPricingResponse(BaseModel):
    """Full credit pricing catalog"""
    resume_matching: Dict[str, int] = Field(
        default={
            "upload": 2,
            "job_processing": 5,
        }
    )
    coding_interview: Dict[str, int] = Field(
        default={
            "generation": 4,
            "submission": 1,
        }
    )
    voice_screening: Dict[str, int] = Field(
        default={
            "call_per_minute": 15,
            "summary": 3,
        }
    )


# ============================================================================
# Error Responses
# ============================================================================

class InsufficientCreditsErrorResponse(BaseModel):
    """Error response for insufficient credits"""
    detail: str
    required: int
    available: int
    feature: Optional[str] = None
    action: Optional[str] = None


class CreditOperationErrorResponse(BaseModel):
    """Generic credit operation error"""
    detail: str
    error_code: Optional[str] = None


# ============================================================================
# Statistics & Analytics
# ============================================================================

class CreditUsageStats(BaseModel):
    """Credit usage statistics for an organization"""
    org_id: UUID

    # Current state
    current_balance: int
    total_purchased: int
    total_consumed: int

    # Breakdown by feature
    consumed_by_feature: Dict[str, int] = Field(
        default_factory=dict,
        description="Credits consumed per feature"
    )

    # Recent activity
    last_transaction_date: Optional[datetime] = None
    transactions_last_30_days: int = 0
    consumed_last_30_days: int = 0


class CreditUsageByDay(BaseModel):
    """Daily credit usage breakdown"""
    date: str  # YYYY-MM-DD
    consumed: int
    refunded: int
    net: int


class CreditUsageAnalyticsResponse(BaseModel):
    """Detailed credit usage analytics"""
    stats: CreditUsageStats
    daily_usage: List[CreditUsageByDay]
    top_features: List[Dict[str, Any]]  # [{feature: str, consumed: int, percentage: float}]


# ============================================================================
# Bulk Operations
# ============================================================================

class BulkCreditCheckRequest(BaseModel):
    """Check if org has sufficient credits for bulk operation"""
    feature: str
    action: str
    count: int = Field(..., gt=0, description="Number of operations")


class BulkCreditCheckResponse(BaseModel):
    """Result of bulk credit check"""
    feature: str
    action: str
    count: int
    credit_per_operation: int
    total_credits_required: int
    current_balance: int
    sufficient: bool
    shortfall: int = Field(0, ge=0)  # How many credits short (0 if sufficient)
