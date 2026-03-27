"""
Credit Service for managing organization credit balances and transactions.

Handles:
- Credit balance checks
- Credit deductions (simple operations)
- Credit holds (refundable operations like voice calls)
- Credit refunds
- Transaction history
"""

import logging
from typing import Dict, List, Optional, Any
from uuid import UUID
from datetime import datetime, timedelta
from supabase import Client
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


# ============================================================================
# Credit Pricing Configuration
# ============================================================================

CREDIT_PRICING = {
    "resume_matching": {
        "upload": 2,           # Per resume upload & parse
        "job_processing": 5,   # Per job description processing
    },
    "coding_interview": {
        "generation": 4,       # Per AI question generation
        "submission": 1,       # Per submission storage
    },
    "voice_screening": {
        "call_per_minute": 15, # Per minute of voice call
        "summary": 3,          # Per AI call summary
    }
}


class InsufficientCreditsError(Exception):
    """Raised when organization doesn't have enough credits."""
    def __init__(self, required: int, available: int):
        self.required = required
        self.available = available
        super().__init__(
            f"Insufficient credits: required {required}, available {available}"
        )


class CreditService:
    """Service for managing organization credits."""

    def __init__(self):
        self.client: Client = get_supabase()

    # ========================================================================
    # Balance Queries
    # ========================================================================

    def get_balance(self, org_id: str) -> int:
        """
        Get current credit balance for an organization.

        Args:
            org_id: Organization UUID

        Returns:
            Current credit balance (0 if no record exists)
        """
        try:
            result = (
                self.client.table("organization_credits")
                .select("balance")
                .eq("org_id", org_id)
                .execute()
            )

            if not result.data:
                logger.warning(f"No credit record for org {org_id}, returning 0")
                return 0

            return result.data[0]["balance"]

        except Exception as e:
            logger.error(f"Error fetching credit balance for org {org_id}: {e}")
            raise

    def check_balance(self, org_id: str, required: int) -> bool:
        """
        Check if organization has sufficient credits.

        Args:
            org_id: Organization UUID
            required: Required number of credits

        Returns:
            True if sufficient credits, False otherwise
        """
        balance = self.get_balance(org_id)
        return balance >= required

    def ensure_balance(self, org_id: str, required: int) -> None:
        """
        Ensure organization has sufficient credits, raise exception if not.

        Args:
            org_id: Organization UUID
            required: Required number of credits

        Raises:
            InsufficientCreditsError: If insufficient credits
        """
        balance = self.get_balance(org_id)
        if balance < required:
            raise InsufficientCreditsError(required, balance)

    # ========================================================================
    # Simple Deductions (Resume, Coding Interviews)
    # ========================================================================

    def deduct_credits(
        self,
        org_id: str,
        feature: str,
        action: str,
        amount: int,
        reference_id: Optional[str] = None,
        notes: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Deduct credits from organization balance.

        Args:
            org_id: Organization UUID
            feature: Feature name (resume_matching, coding_interview, etc.)
            action: Action name (upload, generation, etc.)
            amount: Number of credits to deduct
            reference_id: Optional reference to resource (resume_id, etc.)
            notes: Optional notes
            user_id: Optional user who triggered the deduction

        Returns:
            Transaction ID

        Raises:
            InsufficientCreditsError: If insufficient credits
        """
        try:
            # Check sufficient balance
            self.ensure_balance(org_id, amount)

            # Update balance
            result = (
                self.client.table("organization_credits")
                .update({
                    "balance": self.client.table("organization_credits")
                        .select("balance")
                        .eq("org_id", org_id)
                        .execute()
                        .data[0]["balance"] - amount,
                    "total_consumed": self.client.table("organization_credits")
                        .select("total_consumed")
                        .eq("org_id", org_id)
                        .execute()
                        .data[0]["total_consumed"] + amount,
                })
                .eq("org_id", org_id)
                .execute()
            )

            new_balance = result.data[0]["balance"]

            # Create transaction record
            transaction_data = {
                "org_id": org_id,
                "type": "deduction",
                "amount": -amount,  # Negative for deduction
                "balance_after": new_balance,
                "feature": feature,
                "action": action,
                "reference_id": reference_id,
                "notes": notes,
                "created_by": user_id,
            }

            transaction_result = (
                self.client.table("credit_transactions")
                .insert(transaction_data)
                .execute()
            )

            transaction_id = transaction_result.data[0]["id"]

            logger.info(
                f"Deducted {amount} credits from org {org_id} "
                f"for {feature}:{action}, new balance: {new_balance}"
            )

            return transaction_id

        except InsufficientCreditsError:
            raise
        except Exception as e:
            logger.error(f"Error deducting credits for org {org_id}: {e}")
            raise

    # ========================================================================
    # Refundable Operations (Voice Calls with Holds)
    # ========================================================================

    def hold_credits(
        self,
        org_id: str,
        amount: int,
        feature: str,
        reference_id: str,
        expires_at: Optional[datetime] = None,
    ) -> str:
        """
        Hold credits for a refundable operation (e.g., voice call).

        Args:
            org_id: Organization UUID
            amount: Number of credits to hold
            feature: Feature name (voice_screening)
            reference_id: Reference to resource (voice_candidate_id, call_id)
            expires_at: Optional expiry time for hold

        Returns:
            Hold ID

        Raises:
            InsufficientCreditsError: If insufficient credits
        """
        try:
            # Check sufficient balance
            self.ensure_balance(org_id, amount)

            # Deduct from balance (held credits are not available)
            self.client.table("organization_credits").update({
                "balance": self.client.table("organization_credits")
                    .select("balance")
                    .eq("org_id", org_id)
                    .execute()
                    .data[0]["balance"] - amount,
            }).eq("org_id", org_id).execute()

            # Create hold record
            hold_data = {
                "org_id": org_id,
                "amount": amount,
                "feature": feature,
                "reference_id": reference_id,
                "status": "pending",
                "expires_at": expires_at.isoformat() if expires_at else None,
            }

            hold_result = (
                self.client.table("credit_holds")
                .insert(hold_data)
                .execute()
            )

            hold_id = hold_result.data[0]["id"]

            logger.info(
                f"Held {amount} credits for org {org_id}, "
                f"feature: {feature}, hold_id: {hold_id}"
            )

            return hold_id

        except InsufficientCreditsError:
            raise
        except Exception as e:
            logger.error(f"Error holding credits for org {org_id}: {e}")
            raise

    def capture_hold(
        self,
        hold_id: str,
        actual_amount: int,
        notes: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Capture a credit hold with actual amount used (refund difference).

        Args:
            hold_id: Hold ID to capture
            actual_amount: Actual credits consumed
            notes: Optional notes for transaction
            user_id: Optional user who triggered the capture

        Returns:
            Transaction ID

        Raises:
            ValueError: If hold not found or not pending
        """
        try:
            # Get hold record
            hold_result = (
                self.client.table("credit_holds")
                .select("*")
                .eq("id", hold_id)
                .execute()
            )

            if not hold_result.data:
                raise ValueError(f"Hold {hold_id} not found")

            hold = hold_result.data[0]

            if hold["status"] != "pending":
                raise ValueError(f"Hold {hold_id} is not pending (status: {hold['status']})")

            org_id = hold["org_id"]
            held_amount = hold["amount"]
            feature = hold["feature"]
            reference_id = hold["reference_id"]

            # Calculate refund (if actual < held)
            refund_amount = max(0, held_amount - actual_amount)

            # Update organization: add refund back to balance, add actual to consumed
            current_balance = self.get_balance(org_id)
            new_balance = current_balance + refund_amount

            self.client.table("organization_credits").update({
                "balance": new_balance,
                "total_consumed": self.client.table("organization_credits")
                    .select("total_consumed")
                    .eq("org_id", org_id)
                    .execute()
                    .data[0]["total_consumed"] + actual_amount,
            }).eq("org_id", org_id).execute()

            # Create deduction transaction for actual amount
            transaction_data = {
                "org_id": org_id,
                "type": "deduction",
                "amount": -actual_amount,
                "balance_after": new_balance,
                "feature": feature,
                "action": "hold_capture",
                "reference_id": reference_id,
                "notes": notes or f"Captured hold {hold_id} (held: {held_amount}, used: {actual_amount})",
                "created_by": user_id,
            }

            transaction_result = (
                self.client.table("credit_transactions")
                .insert(transaction_data)
                .execute()
            )

            transaction_id = transaction_result.data[0]["id"]

            # If refund occurred, create refund transaction
            if refund_amount > 0:
                refund_transaction_data = {
                    "org_id": org_id,
                    "type": "refund",
                    "amount": refund_amount,
                    "balance_after": new_balance,
                    "feature": feature,
                    "action": "hold_refund",
                    "reference_id": reference_id,
                    "notes": f"Refund from hold {hold_id} ({refund_amount} unused credits)",
                    "created_by": user_id,
                }

                self.client.table("credit_transactions").insert(refund_transaction_data).execute()

            # Mark hold as captured
            self.client.table("credit_holds").update({
                "status": "captured",
                "transaction_id": transaction_id,
            }).eq("id", hold_id).execute()

            logger.info(
                f"Captured hold {hold_id} for org {org_id}: "
                f"held={held_amount}, used={actual_amount}, refunded={refund_amount}"
            )

            return transaction_id

        except Exception as e:
            logger.error(f"Error capturing hold {hold_id}: {e}")
            raise

    def refund_hold(
        self,
        hold_id: str,
        reason: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Fully refund a credit hold (e.g., if operation failed).

        Args:
            hold_id: Hold ID to refund
            reason: Reason for refund
            user_id: Optional user who triggered the refund

        Returns:
            Transaction ID

        Raises:
            ValueError: If hold not found or not pending
        """
        try:
            # Get hold record
            hold_result = (
                self.client.table("credit_holds")
                .select("*")
                .eq("id", hold_id)
                .execute()
            )

            if not hold_result.data:
                raise ValueError(f"Hold {hold_id} not found")

            hold = hold_result.data[0]

            if hold["status"] != "pending":
                raise ValueError(f"Hold {hold_id} is not pending (status: {hold['status']})")

            org_id = hold["org_id"]
            amount = hold["amount"]
            feature = hold["feature"]
            reference_id = hold["reference_id"]

            # Refund full amount back to balance
            current_balance = self.get_balance(org_id)
            new_balance = current_balance + amount

            self.client.table("organization_credits").update({
                "balance": new_balance,
            }).eq("org_id", org_id).execute()

            # Create refund transaction
            transaction_data = {
                "org_id": org_id,
                "type": "refund",
                "amount": amount,
                "balance_after": new_balance,
                "feature": feature,
                "action": "hold_refund_full",
                "reference_id": reference_id,
                "notes": reason or f"Full refund for hold {hold_id}",
                "created_by": user_id,
            }

            transaction_result = (
                self.client.table("credit_transactions")
                .insert(transaction_data)
                .execute()
            )

            transaction_id = transaction_result.data[0]["id"]

            # Mark hold as refunded
            self.client.table("credit_holds").update({
                "status": "refunded",
                "transaction_id": transaction_id,
            }).eq("id", hold_id).execute()

            logger.info(
                f"Fully refunded hold {hold_id} for org {org_id}: {amount} credits"
            )

            return transaction_id

        except Exception as e:
            logger.error(f"Error refunding hold {hold_id}: {e}")
            raise

    # ========================================================================
    # Refunds for Simple Deductions
    # ========================================================================

    def refund_credits(
        self,
        org_id: str,
        amount: int,
        feature: str,
        action: str,
        reference_id: Optional[str] = None,
        reason: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Refund credits for a failed operation.

        Args:
            org_id: Organization UUID
            amount: Number of credits to refund
            feature: Feature name
            action: Action name
            reference_id: Optional reference to resource
            reason: Reason for refund
            user_id: Optional user who triggered the refund

        Returns:
            Transaction ID
        """
        try:
            # Add credits back to balance
            current_balance = self.get_balance(org_id)
            new_balance = current_balance + amount

            # Update balance (reduce total_consumed)
            self.client.table("organization_credits").update({
                "balance": new_balance,
                "total_consumed": max(0, self.client.table("organization_credits")
                    .select("total_consumed")
                    .eq("org_id", org_id)
                    .execute()
                    .data[0]["total_consumed"] - amount),
            }).eq("org_id", org_id).execute()

            # Create refund transaction
            transaction_data = {
                "org_id": org_id,
                "type": "refund",
                "amount": amount,
                "balance_after": new_balance,
                "feature": feature,
                "action": action,
                "reference_id": reference_id,
                "notes": reason or f"Refund for failed {feature}:{action}",
                "created_by": user_id,
            }

            transaction_result = (
                self.client.table("credit_transactions")
                .insert(transaction_data)
                .execute()
            )

            transaction_id = transaction_result.data[0]["id"]

            logger.info(
                f"Refunded {amount} credits to org {org_id} "
                f"for {feature}:{action}, new balance: {new_balance}"
            )

            return transaction_id

        except Exception as e:
            logger.error(f"Error refunding credits for org {org_id}: {e}")
            raise

    # ========================================================================
    # Admin Operations
    # ========================================================================

    def add_credits(
        self,
        org_id: str,
        amount: int,
        transaction_type: str = "purchase",
        notes: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Add credits to organization (purchase or bonus).

        Args:
            org_id: Organization UUID
            amount: Number of credits to add
            transaction_type: 'purchase' or 'bonus'
            notes: Optional notes
            user_id: Optional user who triggered the addition

        Returns:
            Transaction ID
        """
        try:
            if transaction_type not in ["purchase", "bonus"]:
                raise ValueError(f"Invalid transaction type: {transaction_type}")

            # Update balance
            current_balance = self.get_balance(org_id)
            new_balance = current_balance + amount

            self.client.table("organization_credits").update({
                "balance": new_balance,
                "total_purchased": self.client.table("organization_credits")
                    .select("total_purchased")
                    .eq("org_id", org_id)
                    .execute()
                    .data[0]["total_purchased"] + amount,
            }).eq("org_id", org_id).execute()

            # Create transaction record
            transaction_data = {
                "org_id": org_id,
                "type": transaction_type,
                "amount": amount,
                "balance_after": new_balance,
                "notes": notes or f"Added {amount} credits via {transaction_type}",
                "created_by": user_id,
            }

            transaction_result = (
                self.client.table("credit_transactions")
                .insert(transaction_data)
                .execute()
            )

            transaction_id = transaction_result.data[0]["id"]

            logger.info(
                f"Added {amount} credits to org {org_id} "
                f"via {transaction_type}, new balance: {new_balance}"
            )

            return transaction_id

        except Exception as e:
            logger.error(f"Error adding credits for org {org_id}: {e}")
            raise

    # ========================================================================
    # Transaction History
    # ========================================================================

    def get_transaction_history(
        self,
        org_id: str,
        limit: int = 50,
        offset: int = 0,
        transaction_type: Optional[str] = None,
        feature: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get transaction history for an organization.

        Args:
            org_id: Organization UUID
            limit: Number of transactions to return
            offset: Pagination offset
            transaction_type: Optional filter by type
            feature: Optional filter by feature

        Returns:
            List of transaction records
        """
        try:
            query = (
                self.client.table("credit_transactions")
                .select("*")
                .eq("org_id", org_id)
                .order("created_at", desc=True)
                .limit(limit)
                .offset(offset)
            )

            if transaction_type:
                query = query.eq("type", transaction_type)

            if feature:
                query = query.eq("feature", feature)

            result = query.execute()

            return result.data

        except Exception as e:
            logger.error(f"Error fetching transaction history for org {org_id}: {e}")
            raise

    # ========================================================================
    # Utility Methods
    # ========================================================================

    def get_credit_cost(self, feature: str, action: str) -> int:
        """
        Get credit cost for a specific feature/action.

        Args:
            feature: Feature name (resume_matching, coding_interview, voice_screening)
            action: Action name (upload, generation, call_per_minute, etc.)

        Returns:
            Credit cost

        Raises:
            ValueError: If feature/action not found in pricing
        """
        if feature not in CREDIT_PRICING:
            raise ValueError(f"Unknown feature: {feature}")

        if action not in CREDIT_PRICING[feature]:
            raise ValueError(f"Unknown action '{action}' for feature '{feature}'")

        return CREDIT_PRICING[feature][action]


# ============================================================================
# Singleton
# ============================================================================

_credit_service: Optional[CreditService] = None


def get_credit_service() -> CreditService:
    """Get or create the singleton CreditService instance."""
    global _credit_service
    if _credit_service is None:
        _credit_service = CreditService()
    return _credit_service
