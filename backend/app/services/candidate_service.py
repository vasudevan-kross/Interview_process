"""
Candidate Service: Manages global candidate profiles across batches.

This service handles candidate identity and score tracking across multiple batches.
Each candidate has a unique profile per organization with their best scores.
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.db.supabase_client import get_supabase
from app.services.user_service import get_user_service

logger = logging.getLogger(__name__)


class CandidateService:
    """Manages global candidate profiles across batches."""

    def __init__(self):
        self.client = get_supabase()
        self.user_service = get_user_service()

    def _resolve_user_id(self, auth_user_id: str) -> str:
        """Resolve Supabase auth UUID to the users table ID."""
        return self.user_service.resolve_user_id(auth_user_id)

    # ── Candidate CRUD ────────────────────────────────────────────────────

    def get_or_create_candidate(
        self, email: str, name: str, phone: Optional[str], org_id: str
    ) -> dict:
        """
        Get existing candidate by email or create a new one.

        This ensures candidate identity is tracked across batches.
        Returns the candidate record.
        """
        email = email.lower().strip()

        # Try to find existing candidate
        result = self.client.table("candidates").select("*").eq("org_id", org_id).eq("email", email).execute()

        if result.data:
            logger.info(f"Found existing candidate: {email} in org {org_id}")
            return result.data[0]

        # Create new candidate
        new_candidate = {
            "org_id": org_id,
            "email": email,
            "name": name,
            "phone": phone,
            "best_resume_score": None,
            "best_coding_score": None,
            "best_voice_score": None,
            "total_batches_participated": 0,
            "last_activity_at": datetime.utcnow().isoformat(),
        }

        result = self.client.table("candidates").insert(new_candidate).execute()

        if not result.data:
            raise ValueError(f"Failed to create candidate: {email}")

        logger.info(f"Created new candidate: {email} in org {org_id}")
        return result.data[0]

    def get_candidate_by_id(self, candidate_id: str, org_id: str) -> dict:
        """Get candidate by ID with org validation."""
        result = (
            self.client.table("candidates")
            .select("*")
            .eq("id", candidate_id)
            .eq("org_id", org_id)
            .execute()
        )

        if not result.data:
            raise ValueError(f"Candidate not found: {candidate_id}")

        return result.data[0]

    def get_candidate_by_email(self, email: str, org_id: str) -> Optional[dict]:
        """Get candidate by email."""
        email = email.lower().strip()

        result = (
            self.client.table("candidates")
            .select("*")
            .eq("org_id", org_id)
            .eq("email", email)
            .execute()
        )

        return result.data[0] if result.data else None

    def update_candidate(
        self, candidate_id: str, updates: dict, org_id: str
    ) -> dict:
        """Update candidate information."""
        # Validate candidate exists in org
        self.get_candidate_by_id(candidate_id, org_id)

        # Filter allowed fields
        allowed_fields = {"name", "phone"}
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        if not filtered_updates:
            raise ValueError("No valid fields to update")

        result = (
            self.client.table("candidates")
            .update(filtered_updates)
            .eq("id", candidate_id)
            .eq("org_id", org_id)
            .execute()
        )

        if not result.data:
            raise ValueError(f"Failed to update candidate: {candidate_id}")

        return result.data[0]

    # ── Batch History & Scores ────────────────────────────────────────────

    def get_candidate_history(self, email: str, org_id: str) -> List[dict]:
        """
        Get all batch participations for a candidate.

        Returns list of batch_candidates records with batch info.
        """
        email = email.lower().strip()

        # Get candidate
        candidate = self.get_candidate_by_email(email, org_id)
        if not candidate:
            return []

        # Get all batch participations
        result = (
            self.client.table("batch_candidates")
            .select(
                """
                *,
                hiring_batches:batch_id (
                    id,
                    name,
                    status,
                    job_description_id,
                    created_at
                )
            """
            )
            .eq("candidate_id", candidate["id"])
            .order("created_at", desc=True)
            .execute()
        )

        return result.data or []

    def get_candidate_best_scores(self, email: str, org_id: str) -> dict:
        """
        Get candidate's best scores across all batches.

        Returns:
        {
            "candidate_id": "uuid",
            "email": "john@example.com",
            "name": "John Doe",
            "best_resume_score": 92.5,
            "best_coding_score": 88.0,
            "best_voice_score": 85.0,
            "total_batches": 3,
            "last_activity_at": "2025-01-20T10:30:00Z"
        }
        """
        email = email.lower().strip()

        candidate = self.get_candidate_by_email(email, org_id)
        if not candidate:
            return {
                "email": email,
                "found": False,
                "message": "Candidate not found in this organization",
            }

        return {
            "candidate_id": candidate["id"],
            "email": candidate["email"],
            "name": candidate["name"],
            "phone": candidate.get("phone"),
            "best_resume_score": candidate.get("best_resume_score"),
            "best_coding_score": candidate.get("best_coding_score"),
            "best_voice_score": candidate.get("best_voice_score"),
            "total_batches": candidate.get("total_batches_participated", 0),
            "last_activity_at": candidate.get("last_activity_at"),
        }

    def list_candidates(
        self,
        org_id: str,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
    ) -> dict:
        """
        List all candidates in organization with pagination.

        Args:
            org_id: Organization ID
            limit: Max results (default 50)
            offset: Pagination offset
            search: Optional email/name search term

        Returns:
            {"candidates": [...], "total": 123}
        """
        query = self.client.table("candidates").select("*", count="exact").eq("org_id", org_id)

        # Apply search filter
        if search:
            search_term = f"%{search.lower()}%"
            query = query.or_(f"email.ilike.{search_term},name.ilike.{search_term}")

        # Count total
        count_result = query.execute()
        total = count_result.count or 0

        # Get paginated results
        query = query.order("last_activity_at", desc=True).range(offset, offset + limit - 1)

        result = query.execute()

        return {
            "candidates": result.data or [],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    # ── Module Result Updates ─────────────────────────────────────────────

    def update_module_result(
        self, candidate_id: str, module: str, result: dict, org_id: str
    ) -> dict:
        """
        Update a candidate's module result in their global profile.

        Note: This is typically called automatically via triggers when
        batch_candidates.module_results is updated. This method provides
        a direct way to update best scores if needed.

        Args:
            candidate_id: Candidate UUID
            module: Module name ('resume_screening', 'technical_assessment', 'voice_screening')
            result: Module result dict with 'score' key
            org_id: Organization ID

        Returns:
            Updated candidate record
        """
        valid_modules = ["resume_screening", "technical_assessment", "voice_screening"]
        if module not in valid_modules:
            raise ValueError(f"Invalid module. Must be one of: {valid_modules}")

        # Get current candidate
        candidate = self.get_candidate_by_id(candidate_id, org_id)

        # Extract new score
        new_score = result.get("score")
        if new_score is None:
            logger.warning(f"No score in result for module {module}")
            return candidate

        # Determine which best score to update
        field_map = {
            "resume_screening": "best_resume_score",
            "technical_assessment": "best_coding_score",
            "voice_screening": "best_voice_score",
        }

        field_name = field_map[module]
        current_best = candidate.get(field_name) or 0

        # Update if new score is better
        if new_score > current_best:
            update_data = {
                field_name: new_score,
                "last_activity_at": datetime.utcnow().isoformat(),
            }

            result = (
                self.client.table("candidates")
                .update(update_data)
                .eq("id", candidate_id)
                .eq("org_id", org_id)
                .execute()
            )

            if not result.data:
                raise ValueError(f"Failed to update candidate best score: {candidate_id}")

            logger.info(
                f"Updated {field_name} for candidate {candidate_id}: {current_best} → {new_score}"
            )
            return result.data[0]

        logger.debug(
            f"New score {new_score} not better than current best {current_best} for {field_name}"
        )
        return candidate


# ── Singleton Pattern ─────────────────────────────────────────────────────

_candidate_service: Optional[CandidateService] = None


def get_candidate_service() -> CandidateService:
    """Get singleton instance of CandidateService."""
    global _candidate_service
    if _candidate_service is None:
        _candidate_service = CandidateService()
    return _candidate_service
