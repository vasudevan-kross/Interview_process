"""
Credits API endpoints for organization credit management.

Provides REST API for:
- Viewing credit balance
- Transaction history
- Credit pricing information
- Admin operations (add credits)
- Bulk operation credit checks
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from uuid import UUID

from app.schemas.credits import (
    CreditBalanceResponse,
    CreditTransactionResponse,
    TransactionHistoryRequest,
    TransactionHistoryResponse,
    AddCreditsRequest,
    AddCreditsResponse,
    CreditPricingResponse,
    InsufficientCreditsErrorResponse,
    BulkCreditCheckRequest,
    BulkCreditCheckResponse,
)
from app.services.credit_service import (
    get_credit_service,
    InsufficientCreditsError,
    CREDIT_PRICING,
)
from app.auth.dependencies import get_current_org_context, OrgContext, get_current_user_id
from app.auth.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/credits", tags=["Credits"])


# ============================================================================
# Credit Balance Endpoints
# ============================================================================

@router.get(
    "/balance",
    response_model=CreditBalanceResponse,
    summary="Get organization credit balance"
)
async def get_credit_balance(
    ctx: OrgContext = Depends(require_permission("organization:view")),
):
    """
    Get current credit balance for the organization.

    Returns:
        - Current balance
        - Total purchased
        - Total consumed
        - Last updated timestamp
    """
    try:
        credit_service = get_credit_service()

        # Debug logging
        logger.info(f"Fetching credit balance for org_id: {ctx.org_id}")

        # Get balance from organization_credits table
        result = credit_service.client.table("organization_credits").select(
            "org_id, balance, total_purchased, total_consumed, last_updated"
        ).eq("org_id", str(ctx.org_id)).execute()

        logger.info(f"Query result: data count = {len(result.data) if result.data else 0}")
        if result.data:
            logger.info(f"First record: {result.data[0]}")

        if not result.data or len(result.data) == 0:
            # No record yet, initialize with zero balance
            from datetime import datetime
            logger.warning(f"No credit record found for org {ctx.org_id}, returning zero balance")
            return CreditBalanceResponse(
                org_id=ctx.org_id,
                balance=0,
                total_purchased=0,
                total_consumed=0,
                last_updated=datetime.now(),
            )

        data = result.data[0]
        # Ensure last_updated is a datetime object
        from datetime import datetime
        if isinstance(data.get('last_updated'), str):
            data['last_updated'] = datetime.fromisoformat(data['last_updated'].replace('Z', '+00:00'))

        logger.info(f"Returning balance: {data.get('balance')}")
        return CreditBalanceResponse(**data)

    except Exception as e:
        logger.error(f"Error fetching credit balance for org {ctx.org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch credit balance: {str(e)}"
        )


# ============================================================================
# Transaction History Endpoints
# ============================================================================

@router.get(
    "/transactions",
    response_model=TransactionHistoryResponse,
    summary="Get transaction history"
)
async def get_transaction_history(
    limit: int = Query(50, ge=1, le=200, description="Number of transactions to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    transaction_type: Optional[str] = Query(None, description="Filter by type"),
    feature: Optional[str] = Query(None, description="Filter by feature"),
    ctx: OrgContext = Depends(require_permission("organization:view")),
):
    """
    Get paginated transaction history for the organization.

    Query parameters:
        - limit: Number of transactions (1-200)
        - offset: Pagination offset
        - transaction_type: Filter by type (purchase, deduction, refund, bonus)
        - feature: Filter by feature (resume_matching, coding_interview, voice_screening)

    Returns:
        - List of transactions
        - Total count
        - Pagination info
    """
    try:
        credit_service = get_credit_service()

        # Get transactions
        transactions = credit_service.get_transaction_history(
            org_id=str(ctx.org_id),
            limit=limit,
            offset=offset,
            transaction_type=transaction_type,
            feature=feature,
        )

        # Get total count for pagination
        count_query = (
            credit_service.client.table("credit_transactions")
            .select("id", count="exact")
            .eq("org_id", str(ctx.org_id))
        )

        if transaction_type:
            count_query = count_query.eq("type", transaction_type)
        if feature:
            count_query = count_query.eq("feature", feature)

        count_result = count_query.execute()
        total = count_result.count if hasattr(count_result, 'count') else len(transactions)

        return TransactionHistoryResponse(
            transactions=[CreditTransactionResponse(**t) for t in transactions],
            total=total,
            limit=limit,
            offset=offset,
        )

    except Exception as e:
        logger.error(f"Error fetching transaction history for org {ctx.org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch transaction history: {str(e)}"
        )


# ============================================================================
# Credit Pricing Endpoints
# ============================================================================

@router.get(
    "/pricing",
    response_model=CreditPricingResponse,
    summary="Get credit pricing catalog"
)
async def get_credit_pricing():
    """
    Get current credit pricing for all features and actions.

    Returns:
        - Resume Matching: upload, job_processing
        - Coding Interview: generation, submission
        - Voice Screening: call_per_minute, summary
    """
    return CreditPricingResponse(**CREDIT_PRICING)


# ============================================================================
# Bulk Operation Check
# ============================================================================

@router.post(
    "/check-bulk",
    response_model=BulkCreditCheckResponse,
    summary="Check credits for bulk operation"
)
async def check_bulk_credits(
    request: BulkCreditCheckRequest,
    ctx: OrgContext = Depends(require_permission("organization:view")),
):
    """
    Check if organization has sufficient credits for a bulk operation.

    Request body:
        - feature: Feature name (resume_matching, coding_interview, voice_screening)
        - action: Action name (upload, generation, call_per_minute, summary)
        - count: Number of operations

    Returns:
        - Credit cost per operation
        - Total credits required
        - Current balance
        - Whether sufficient credits available
        - Shortfall amount (if insufficient)
    """
    try:
        credit_service = get_credit_service()

        # Get credit cost
        try:
            credit_per_operation = credit_service.get_credit_cost(
                request.feature,
                request.action
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

        total_required = credit_per_operation * request.count
        current_balance = credit_service.get_balance(str(ctx.org_id))

        sufficient = current_balance >= total_required
        shortfall = max(0, total_required - current_balance)

        return BulkCreditCheckResponse(
            feature=request.feature,
            action=request.action,
            count=request.count,
            credit_per_operation=credit_per_operation,
            total_credits_required=total_required,
            current_balance=current_balance,
            sufficient=sufficient,
            shortfall=shortfall,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking bulk credits for org {ctx.org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check bulk credits: {str(e)}"
        )


# ============================================================================
# Admin Operations
# ============================================================================

@router.post(
    "/admin/add",
    response_model=AddCreditsResponse,
    summary="Add credits to organization (Admin only)"
)
async def add_credits_admin(
    request: AddCreditsRequest,
    ctx: OrgContext = Depends(require_permission("organization:admin")),
    user_id: str = Depends(get_current_user_id),
):
    """
    Add credits to an organization (admin only).

    Request body:
        - org_id: Target organization UUID
        - amount: Number of credits to add (must be positive)
        - transaction_type: 'purchase' or 'bonus'
        - notes: Optional notes for the transaction

    Returns:
        - Transaction ID
        - New balance
        - Confirmation message

    Requires: organization:admin permission
    """
    try:
        credit_service = get_credit_service()

        # Add credits
        transaction_id = credit_service.add_credits(
            org_id=str(request.org_id),
            amount=request.amount,
            transaction_type=request.transaction_type,
            notes=request.notes,
            user_id=user_id,
        )

        # Get new balance
        new_balance = credit_service.get_balance(str(request.org_id))

        return AddCreditsResponse(
            transaction_id=transaction_id,
            org_id=request.org_id,
            amount=request.amount,
            new_balance=new_balance,
            message=f"Successfully added {request.amount} credits via {request.transaction_type}",
        )

    except Exception as e:
        logger.error(f"Error adding credits to org {request.org_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add credits: {str(e)}"
        )


# ============================================================================
# Health Check
# ============================================================================

@router.get(
    "/health",
    summary="Credit system health check"
)
async def credit_system_health():
    """
    Health check endpoint for credit system.

    Returns:
        - Status of credit service
        - Available features
    """
    try:
        credit_service = get_credit_service()

        # Simple connectivity check
        result = credit_service.client.table("organization_credits").select("org_id").limit(1).execute()

        return {
            "status": "healthy",
            "message": "Credit system operational",
            "features": list(CREDIT_PRICING.keys()),
        }

    except Exception as e:
        logger.error(f"Credit system health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Credit system unhealthy: {str(e)}"
        )
