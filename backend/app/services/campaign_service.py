"""
Service for managing hiring campaigns
"""
# pyright: reportGeneralTypeIssues=false

import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from supabase import Client
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def _coerce_dict(data: Any) -> Dict[str, Any]:
    return data if isinstance(data, dict) else {}


def _coerce_list(data: Any) -> List[Dict[str, Any]]:
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


class CampaignService:
    """Service for campaign CRUD operations"""

    def __init__(self):
        self.client: Client = get_supabase()

    def create_campaign(
        self,
        org_id: str,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new hiring campaign.

        Args:
            org_id: Organization ID
            user_id: User ID creating the campaign
            name: Campaign name
            description: Campaign description
            metadata: Campaign metadata (slots, target_roles, settings)

        Returns:
            Created campaign data
        """
        try:
            campaign_data: Dict[str, Any] = {
                "org_id": org_id,
                "created_by": user_id,
                "name": name,
                "status": "active",
            }

            if description:
                campaign_data["description"] = description

            if metadata:
                campaign_data["metadata"] = metadata

            result = (
                self.client.table("hiring_campaigns").insert(campaign_data).execute()
            )
            data = _coerce_list(result.data)

            if not data:
                raise ValueError("Failed to create campaign")

            logger.info(f"Created campaign: {data[0].get('id')} - {name}")
            return data[0]

        except Exception as e:
            logger.error(f"Error creating campaign: {e}")
            raise

    def get_campaign(self, campaign_id: str, org_id: str) -> Dict[str, Any]:
        """
        Get campaign by ID.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID (for security)

        Returns:
            Campaign data
        """
        try:
            result = (
                self.client.table("hiring_campaigns")
                .select("*")
                .eq("id", campaign_id)
                .eq("org_id", org_id)
                .execute()
            )
            data = _coerce_list(result.data)

            if not data:
                raise ValueError(f"Campaign not found: {campaign_id}")

            return data[0]

        except Exception as e:
            logger.error(f"Error fetching campaign {campaign_id}: {e}")
            raise

    def list_campaigns(
        self,
        org_id: str,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        List campaigns for an organization.

        Args:
            org_id: Organization ID
            status: Filter by status (active, completed, archived)
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of campaigns
        """
        try:
            query = (
                self.client.table("hiring_campaigns")
                .select("*")
                .eq("org_id", org_id)
                .order("created_at", desc=True)
                .limit(limit)
                .offset(offset)
            )

            if status:
                query = query.eq("status", status)

            result = query.execute()
            return _coerce_list(result.data)

        except Exception as e:
            logger.error(f"Error listing campaigns: {e}")
            raise

    def update_campaign(
        self, campaign_id: str, org_id: str, update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID (for security)
            update_data: Fields to update

        Returns:
            Updated campaign data
        """
        try:
            # Only allow updating specific fields
            allowed_fields = {"name", "description", "status", "metadata"}
            filtered_data = {
                k: v for k, v in update_data.items() if k in allowed_fields
            }

            if not filtered_data:
                raise ValueError("No valid fields to update")

            result = (
                self.client.table("hiring_campaigns")
                .update(filtered_data)
                .eq("id", campaign_id)
                .eq("org_id", org_id)
                .execute()
            )
            data = _coerce_list(result.data)

            if not data:
                raise ValueError(f"Campaign not found: {campaign_id}")

            logger.info(f"Updated campaign: {campaign_id}")
            return data[0]

        except Exception as e:
            logger.error(f"Error updating campaign {campaign_id}: {e}")
            raise

    def delete_campaign(self, campaign_id: str, org_id: str) -> bool:
        """
        Delete (archive) a campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID (for security)

        Returns:
            True if successful
        """
        try:
            # Soft delete by setting status to archived
            result = (
                self.client.table("hiring_campaigns")
                .update({"status": "archived"})
                .eq("id", campaign_id)
                .eq("org_id", org_id)
                .execute()
            )
            data = _coerce_list(result.data)

            if not data:
                raise ValueError(f"Campaign not found: {campaign_id}")

            logger.info(f"Archived campaign: {campaign_id}")
            return True

        except Exception as e:
            logger.error(f"Error archiving campaign {campaign_id}: {e}")
            raise

    def get_campaign_statistics(self, campaign_id: str) -> Dict[str, Any]:
        """
        Get campaign statistics using database function.

        Args:
            campaign_id: Campaign ID

        Returns:
            Campaign statistics
        """
        try:
            result = self.client.rpc(
                "get_campaign_statistics", {"p_campaign_id": campaign_id}
            ).execute()
            return _coerce_dict(result.data)

        except Exception as e:
            logger.error(f"Error fetching campaign statistics: {e}")
            raise

    def get_campaign_candidates_summary(self, campaign_id: str) -> List[Dict[str, Any]]:
        """
        Get summary of candidates by job.

        Args:
            campaign_id: Campaign ID

        Returns:
            List of job summaries
        """
        try:
            result = self.client.rpc(
                "get_campaign_candidates_summary", {"p_campaign_id": campaign_id}
            ).execute()
            return _coerce_list(result.data)

        except Exception as e:
            logger.error(f"Error fetching campaign candidates summary: {e}")
            raise

    def get_campaign_candidates(
        self,
        campaign_id: str,
        org_id: str,
        job_id: Optional[str] = None,
        stage: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get candidates for a campaign with optional filters.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID
            job_id: Filter by job description ID
            stage: Filter by current stage
            limit: Maximum results
            offset: Offset for pagination

        Returns:
            List of pipeline candidates
        """
        try:
            query = (
                self.client.table("pipeline_candidates")
                .select("*")
                .eq("campaign_id", campaign_id)
                .eq("org_id", org_id)
                .is_("deleted_at", "null")  # Exclude soft-deleted candidates
                .order("created_at", desc=True)
                .limit(limit)
                .offset(offset)
            )

            if job_id:
                query = query.eq("job_id", job_id)

            if stage:
                query = query.eq("current_stage", stage)

            result = query.execute()
            return _coerce_list(result.data)

        except Exception as e:
            logger.error(f"Error fetching campaign candidates: {e}")
            raise

    def get_campaign_report(self, campaign_id: str, org_id: str) -> Dict[str, Any]:
        """Build report data for a campaign."""
        campaign = self.get_campaign(campaign_id, org_id)
        stats = self.get_campaign_statistics(campaign_id)
        job_summary = self.get_campaign_candidates_summary(campaign_id)

        candidates_result = (
            self.client.table("pipeline_candidates")
            .select(
                "id,job_id,candidate_name,candidate_email,current_stage,recommendation,final_decision,resume_match_score,coding_score,voice_status,interview_slot,created_at,decided_at"
            )
            .eq("campaign_id", campaign_id)
            .eq("org_id", org_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )

        candidates_data = _coerce_list(candidates_result.data)
        job_ids = [
            str(row.get("job_id")) for row in candidates_data if row.get("job_id")
        ]
        job_title_map: Dict[str, str] = {}
        if job_ids:
            job_results = (
                self.client.table("job_descriptions")
                .select("id,title")
                .in_("id", job_ids)
                .execute()
            )
            for job in _coerce_list(job_results.data):
                job_id = job.get("id")
                title = job.get("title")
                if job_id and title:
                    job_title_map[str(job_id)] = str(title)

        candidates = []
        for row in candidates_data:
            job_title = None
            if row.get("job_id"):
                job_title = job_title_map.get(str(row.get("job_id")))
            slot_name = None
            if isinstance(row.get("interview_slot"), dict):
                slot_name = row["interview_slot"].get("slot_name")
            candidates.append(
                {
                    "candidate_name": row.get("candidate_name"),
                    "candidate_email": row.get("candidate_email"),
                    "current_stage": row.get("current_stage"),
                    "recommendation": row.get("recommendation"),
                    "final_decision": row.get("final_decision"),
                    "resume_match_score": row.get("resume_match_score"),
                    "coding_score": row.get("coding_score"),
                    "voice_status": row.get("voice_status"),
                    "slot_name": slot_name,
                    "job_title": job_title,
                    "created_at": row.get("created_at"),
                    "decided_at": row.get("decided_at"),
                }
            )

        return {
            "campaign": {
                "id": campaign.get("id"),
                "name": campaign.get("name"),
                "status": campaign.get("status"),
                "created_at": campaign.get("created_at"),
            },
            "summary": {
                "total_candidates": stats.get("total_candidates", 0),
                "by_stage": stats.get("by_stage", {}),
                "by_decision": stats.get("by_decision", {}),
                "by_recommendation": stats.get("by_recommendation", {}),
                "unique_jobs": stats.get("unique_jobs", 0),
                "avg_resume_score": stats.get("avg_resume_score"),
                "avg_coding_score": stats.get("avg_coding_score"),
            },
            "job_summary": job_summary,
            "candidates": candidates,
        }

    def get_candidate_report(
        self, campaign_id: str, candidate_id: str, org_id: str
    ) -> Dict[str, Any]:
        """Build report data for a single candidate in a campaign."""
        candidate_result = (
            self.client.table("pipeline_candidates")
            .select("*")
            .eq("id", candidate_id)
            .eq("campaign_id", campaign_id)
            .eq("org_id", org_id)
            .is_("deleted_at", "null")
            .single()
            .execute()
        )

        row = _coerce_dict(candidate_result.data)
        if not row:
            raise ValueError("Candidate not found")
        job_title = None
        if row.get("job_id"):
            job_result = (
                self.client.table("job_descriptions")
                .select("title")
                .eq("id", str(row.get("job_id")))
                .single()
                .execute()
            )
            job_data = _coerce_dict(job_result.data)
            job_title = job_data.get("title")

        slot_name = None
        if isinstance(row.get("interview_slot"), dict):
            slot_name = row["interview_slot"].get("slot_name")

        resume_summary = None
        resume_match_score = None
        if row.get("resume_id"):
            resume_result = (
                self.client.table("resumes")
                .select("match_score,parsed_data,llm_analysis")
                .eq("id", row["resume_id"])
                .single()
                .execute()
            )
            resume_data = _coerce_dict(resume_result.data)
            if resume_data:
                parsed = resume_data.get("parsed_data") or {}
                resume_summary = (
                    parsed.get("summary")
                    or resume_data.get("llm_analysis")
                    or parsed.get("professional_summary")
                )
                resume_match_score = resume_data.get("match_score")

        coding_summary = None
        coding_status = None
        coding_score = None
        coding_percentage = None
        if row.get("coding_submission_id"):
            coding_result = (
                self.client.table("coding_submissions")
                .select("total_marks_obtained,percentage,status,submitted_at")
                .eq("id", row["coding_submission_id"])
                .single()
                .execute()
            )
            coding_data = _coerce_dict(coding_result.data)
            if coding_data:
                coding_score = coding_data.get("total_marks_obtained")
                coding_percentage = coding_data.get("percentage")
                coding_status = coding_data.get("status")
                if coding_score or coding_percentage:
                    coding_summary = (
                        f"Score {coding_score or 0} ({coding_percentage or 0}%)"
                    )

        voice_summary = None
        voice_status = None
        if row.get("voice_candidate_id"):
            voice_result = (
                self.client.table("voice_candidates")
                .select("status")
                .eq("id", row["voice_candidate_id"])
                .single()
                .execute()
            )
            voice_data = _coerce_dict(voice_result.data)
            if voice_data:
                voice_status = voice_data.get("status")

            history_result = (
                self.client.table("voice_call_history")
                .select("interview_summary,created_at")
                .eq("candidate_id", row["voice_candidate_id"])
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            history_data = _coerce_list(history_result.data)
            if history_data:
                voice_summary = history_data[0].get("interview_summary")

        return {
            "candidate": {
                "id": row.get("id"),
                "name": row.get("candidate_name"),
                "email": row.get("candidate_email"),
                "phone": row.get("candidate_phone"),
                "job_title": job_title,
                "current_stage": row.get("current_stage"),
                "recommendation": row.get("recommendation"),
                "final_decision": row.get("final_decision"),
                "decision_notes": row.get("decision_notes"),
                "resume_match_score": row.get("resume_match_score"),
                "coding_score": row.get("coding_score"),
                "voice_status": row.get("voice_status"),
                "slot_name": slot_name,
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "decided_at": row.get("decided_at"),
            },
            "resume": {
                "summary": resume_summary,
                "match_score": resume_match_score,
            }
            if resume_summary or resume_match_score is not None
            else None,
            "coding": {
                "status": coding_status,
                "score": coding_score,
                "percentage": coding_percentage,
                "summary": coding_summary,
            }
            if coding_status
            or coding_score is not None
            or coding_percentage is not None
            else None,
            "voice": {
                "status": voice_status,
                "summary": voice_summary,
            }
            if voice_status or voice_summary
            else None,
        }

    def add_candidate_to_campaign(
        self,
        campaign_id: str,
        org_id: str,
        job_id: str,
        candidate_name: str,
        candidate_email: str,
        candidate_phone: Optional[str] = None,
        interview_slot: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Add a candidate to a campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID
            job_id: Job description ID
            candidate_name: Candidate name
            candidate_email: Candidate email
            candidate_phone: Candidate phone
            interview_slot: Interview slot assignment
            created_by: User ID creating the candidate

        Returns:
            Created pipeline candidate
        """
        try:
            candidate_data = {
                "campaign_id": campaign_id,
                "org_id": org_id,
                "job_id": job_id,
                "candidate_name": candidate_name,
                "candidate_email": candidate_email,
                "current_stage": "resume_screening",
                "recommendation": "pending",
                "final_decision": "pending",
                "skipped_stages": [],
            }

            if candidate_phone:
                candidate_data["candidate_phone"] = candidate_phone

            if interview_slot:
                candidate_data["interview_slot"] = interview_slot

            if created_by:
                candidate_data["created_by"] = created_by

            result = (
                self.client.table("pipeline_candidates")
                .insert(candidate_data)
                .execute()
            )
            data = _coerce_list(result.data)

            if not data:
                raise ValueError("Failed to add candidate to campaign")

            logger.info(f"Added candidate to campaign {campaign_id}: {candidate_email}")
            return data[0]

        except Exception as e:
            logger.error(f"Error adding candidate to campaign: {e}")
            raise

    def bulk_add_candidates(
        self,
        campaign_id: str,
        org_id: str,
        candidates: List[Dict[str, Any]],
        created_by: str,
    ) -> Dict[str, Any]:
        """
        Bulk add candidates to a campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID
            candidates: List of candidate data dicts
            created_by: User ID creating the candidates

        Returns:
            Result with success count and errors
        """
        try:
            candidate_records = []

            for candidate in candidates:
                record = {
                    "campaign_id": campaign_id,
                    "org_id": org_id,
                    "job_id": candidate["job_id"],
                    "candidate_name": candidate["name"],
                    "candidate_email": candidate["email"],
                    "current_stage": "resume_screening",
                    "recommendation": "pending",
                    "final_decision": "pending",
                    "skipped_stages": [],
                    "created_by": created_by,
                }

                if candidate.get("phone"):
                    record["candidate_phone"] = candidate["phone"]

                if candidate.get("interview_slot"):
                    record["interview_slot"] = candidate["interview_slot"]

                candidate_records.append(record)

            # Bulk insert
            result = (
                self.client.table("pipeline_candidates")
                .insert(candidate_records)
                .execute()
            )

            data = _coerce_list(result.data)
            imported_count = len(data)
            logger.info(
                f"Bulk added {imported_count} candidates to campaign {campaign_id}"
            )

            return {
                "success": True,
                "imported_count": imported_count,
                "skipped_count": len(candidates) - imported_count,
                "errors": [],
            }

        except Exception as e:
            logger.error(f"Error bulk adding candidates: {e}")
            return {
                "success": False,
                "imported_count": 0,
                "skipped_count": len(candidates),
                "errors": [str(e)],
            }


def get_campaign_service() -> CampaignService:
    """Get campaign service instance"""
    return CampaignService()
