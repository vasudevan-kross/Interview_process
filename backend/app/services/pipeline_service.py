"""Pipeline Service: Unified candidate lifecycle tracking across modules."""

import logging
import uuid
from typing import Optional
from app.db.supabase_client import get_supabase
from app.services.user_service import get_user_service

logger = logging.getLogger(__name__)


class PipelineService:
    """Manages candidate progression through Resume -> Technical -> Voice pipeline."""

    def __init__(self):
        self.client = get_supabase()
        self.user_service = get_user_service()

    def _resolve_user_id(self, auth_user_id: str) -> str:
        """Resolve Supabase auth UUID to the users table ID."""
        return self.user_service.resolve_user_id(auth_user_id)

    # ── Settings ──────────────────────────────────────────────────────────

    def get_pipeline_settings(self, job_id: str, user_id: str, org_id: Optional[str] = None) -> dict:
        """Get pipeline threshold settings for a job."""
        user_id = self._resolve_user_id(user_id)
        query = self.client.table("job_descriptions").select(
            "id, title, pipeline_settings"
        ).eq("id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.execute()

        if not result.data:
            raise ValueError("Job not found or access denied")

        job = result.data[0]
        settings = job.get("pipeline_settings") or {
            "highly_recommended_threshold": 85,
            "recommended_threshold": 65,
        }
        return {"job_id": job_id, "title": job["title"], **settings}

    def update_pipeline_settings(self, job_id: str, user_id: str, settings: dict, org_id: Optional[str] = None) -> dict:
        """Update pipeline threshold settings for a job."""
        user_id = self._resolve_user_id(user_id)
        query = self.client.table("job_descriptions").select("id").eq("id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        check = query.execute()
        if not check.data:
            raise ValueError("Job not found or access denied")

        pipeline_settings = {
            "highly_recommended_threshold": settings.get("highly_recommended_threshold", 85),
            "recommended_threshold": settings.get("recommended_threshold", 65),
        }

        self.client.table("job_descriptions").update(
            {"pipeline_settings": pipeline_settings}
        ).eq("id", job_id).execute()

        return {"job_id": job_id, **pipeline_settings}

    # ── Promote resumes into pipeline ─────────────────────────────────────

    def promote_to_pipeline(self, job_id: str, resume_ids: list[str], user_id: str, org_id: Optional[str] = None) -> dict:
        """Bulk-create pipeline_candidates from selected resumes."""
        user_id = self._resolve_user_id(user_id)
        logger.info(f"🔍 PROMOTE: job_id={job_id}, user_id={user_id}, org_id={org_id}, resume_ids={resume_ids}")

        query = self.client.table("job_descriptions").select(
            "id, pipeline_settings"
        ).eq("id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        job_result = query.execute()

        if not job_result.data:
            raise ValueError("Job not found or access denied")

        settings = job_result.data[0].get("pipeline_settings") or {
            "highly_recommended_threshold": 85,
            "recommended_threshold": 65,
        }
        high_threshold = settings.get("highly_recommended_threshold", 85)
        rec_threshold = settings.get("recommended_threshold", 65)

        # Get resume data
        resumes_result = self.client.table("resumes").select(
            "id, candidate_name, candidate_email, candidate_phone, match_score"
        ).eq("job_description_id", job_id).in_("id", resume_ids).execute()

        if not resumes_result.data:
            raise ValueError("No matching resumes found")

        created = 0
        skipped = 0
        errors = []

        for resume in resumes_result.data:
            score = resume.get("match_score") or 0
            if score >= high_threshold:
                recommendation = "highly_recommended"
            elif score >= rec_threshold:
                recommendation = "recommended"
            else:
                recommendation = "not_recommended"

            record = {
                "job_id": job_id,
                "candidate_name": resume["candidate_name"] or "Unknown",
                "candidate_email": resume["candidate_email"] or "",
                "candidate_phone": resume.get("candidate_phone"),
                "current_stage": "resume_screening",
                "resume_id": resume["id"],
                "resume_match_score": score,
                "recommendation": recommendation,
                "created_by": user_id,
                "deleted_at": None,  # Clear soft-delete flag when re-adding
            }
            if org_id:
                record["org_id"] = org_id

            logger.info(f"📝 Creating pipeline_candidate: email={record['candidate_email']}, org_id={record.get('org_id', 'NULL')}")

            try:
                self.client.table("pipeline_candidates").upsert(
                    record, on_conflict="job_id,candidate_email"
                ).execute()
                created += 1
            except Exception as e:
                logger.warning(f"Failed to add {resume['candidate_email']}: {e}")
                skipped += 1
                errors.append(str(e))

        return {"created": created, "skipped": skipped, "errors": errors}

    def bulk_import_candidates(
        self,
        job_id: str,
        candidates: list[dict],
        user_id: str,
        org_id: Optional[str] = None
    ) -> dict:
        """
        Bulk import candidates directly to pipeline without resumes.

        Args:
            job_id: Job description ID
            candidates: List of dicts with 'name', 'email', 'phone' (phone optional)
            user_id: Creator user ID
            org_id: Organization ID

        Returns:
            {
                "total": int,
                "created": int,
                "skipped": int,
                "errors": List[str]
            }
        """
        user_id = self._resolve_user_id(user_id)

        # Verify job exists and belongs to org
        query = self.client.table("job_descriptions").select("id, title").eq("id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        job_result = query.execute()

        if not job_result.data:
            raise ValueError("Job description not found or access denied")

        results = {
            "total": len(candidates),
            "created": 0,
            "skipped": 0,
            "errors": []
        }

        for candidate in candidates:
            try:
                # Validate required fields
                if not candidate.get("name") or not candidate.get("email"):
                    results["errors"].append(f"Missing name or email for candidate: {candidate}")
                    results["skipped"] += 1
                    continue

                # Create pipeline candidate record
                record = {
                    "job_id": job_id,
                    "candidate_name": candidate["name"],
                    "candidate_email": candidate["email"].lower().strip(),
                    "candidate_phone": candidate.get("phone"),
                    "current_stage": "resume_screening",
                    "resume_id": None,  # No resume yet
                    "resume_match_score": None,  # No score yet
                    "recommendation": "pending",  # Set to pending until resume uploaded
                    "created_by": user_id,
                    "deleted_at": None,  # Clear soft-delete flag when re-adding
                }

                if org_id:
                    record["org_id"] = org_id

                # Use upsert to avoid duplicates (unique constraint on job_id, email)
                self.client.table("pipeline_candidates").upsert(
                    record,
                    on_conflict="job_id,candidate_email"
                ).execute()

                results["created"] += 1

            except Exception as e:
                error_msg = f"Error for {candidate.get('email', 'unknown')}: {str(e)}"
                logger.warning(error_msg)
                results["errors"].append(error_msg)
                results["skipped"] += 1

        logger.info(f"✅ Imported {results['created']} candidates to pipeline for job {job_id}")
        return results

    # ── Advance candidates to next stage ──────────────────────────────────

    def advance_candidates(
        self,
        job_id: str,
        candidate_ids: list[str],
        target_stage: str,
        user_id: str,
        interview_id: Optional[str] = None,
        campaign_id: Optional[str] = None,
        org_id: Optional[str] = None,
    ) -> dict:
        """Move pipeline candidates to a forward stage."""
        user_id = self._resolve_user_id(user_id)
        valid_stages = ["technical_assessment", "voice_screening", "completed"]
        if target_stage not in valid_stages:
            raise ValueError(f"Invalid target stage. Must be one of: {valid_stages}")

        query = self.client.table("pipeline_candidates").select("*").eq("job_id", job_id)
        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        candidates_result = query.in_("id", candidate_ids).execute()

        if not candidates_result.data:
            raise ValueError("No pipeline candidates found")

        stage_order = {
            "resume_screening": 0,
            "technical_assessment": 1,
            "voice_screening": 2,
            "completed": 3,
        }

        advanced = 0
        skipped = 0

        for candidate in candidates_result.data:
            current = candidate["current_stage"]

            # Can't go backwards
            if stage_order.get(target_stage, 0) <= stage_order.get(current, 0):
                skipped += 1
                continue

            # Determine skipped stages
            skipped_stages = list(candidate.get("skipped_stages") or [])
            current_order = stage_order[current]
            target_order = stage_order[target_stage]

            for stage_name, order in stage_order.items():
                if current_order < order < target_order and stage_name not in skipped_stages:
                    skipped_stages.append(stage_name)

            update_data = {
                "current_stage": target_stage,
                "skipped_stages": skipped_stages,
                "updated_at": "now()",
            }

            # Create entries in target module if needed
            if target_stage == "technical_assessment" and interview_id:
                sub_id = self._create_interview_candidate(
                    interview_id, candidate, user_id
                )
                if sub_id:
                    update_data["coding_submission_id"] = None  # linked on submission

            if target_stage == "voice_screening" and campaign_id:
                voice_id = self._create_voice_candidate(
                    campaign_id, candidate, user_id, org_id
                )
                if voice_id:
                    update_data["voice_candidate_id"] = voice_id

            if target_stage == "completed":
                update_data["final_decision"] = candidate.get("final_decision", "pending")

            try:
                self.client.table("pipeline_candidates").update(update_data).eq(
                    "id", candidate["id"]
                ).execute()
                advanced += 1
            except Exception as e:
                logger.error(f"Failed to advance {candidate['id']}: {e}")
                skipped += 1

        return {"advanced": advanced, "skipped": skipped}

    def _create_interview_candidate(self, interview_id: str, candidate: dict, user_id: str) -> Optional[str]:
        """Create an interview_candidates entry for coding assessment."""
        try:
            record = {
                "interview_id": interview_id,
                "name": candidate["candidate_name"],
                "email": candidate["candidate_email"],
                "phone": candidate.get("candidate_phone"),
                "notes": f"Promoted from pipeline (resume score: {candidate.get('resume_match_score', 'N/A')}%)",
            }
            result = self.client.table("interview_candidates").upsert(
                record, on_conflict="interview_id,email"
            ).execute()
            return result.data[0]["id"] if result.data else None
        except Exception as e:
            logger.warning(f"Failed to create interview candidate: {e}")
            return None

    def _create_voice_candidate(self, campaign_id: str, candidate: dict, user_id: str, org_id: Optional[str] = None) -> Optional[str]:
        """Create a voice_candidates entry for voice screening."""
        try:
            token = uuid.uuid4().hex[:12]
            record = {
                "name": candidate["candidate_name"],
                "email": candidate["candidate_email"],
                "phone": candidate.get("candidate_phone"),
                "campaign_id": campaign_id,
                "interview_token": token,
                "status": "pending",
                "created_by": user_id,
            }
            if org_id:
                record["org_id"] = org_id
            result = self.client.table("voice_candidates").insert(record).execute()
            return result.data[0]["id"] if result.data else None
        except Exception as e:
            logger.warning(f"Failed to create voice candidate: {e}")
            return None

    # ── Sync hooks (called from other services) ───────────────────────────

    def sync_coding_results(self, submission_id: str, candidate_email: str, score: float, percentage: float):
        """Called after coding evaluation — updates pipeline if entry exists."""
        try:
            result = self.client.table("pipeline_candidates").select("id").eq(
                "candidate_email", candidate_email
            ).eq("current_stage", "technical_assessment").execute()

            if result.data:
                for pc in result.data:
                    self.client.table("pipeline_candidates").update({
                        "coding_submission_id": submission_id,
                        "coding_score": score,
                        "coding_percentage": percentage,
                    }).eq("id", pc["id"]).execute()
        except Exception as e:
            logger.warning(f"Pipeline sync (coding) failed for {candidate_email}: {e}")

    def sync_voice_results(self, voice_candidate_id: str, status: str):
        """Called after voice call completes — updates pipeline if entry exists."""
        try:
            result = self.client.table("pipeline_candidates").select("id").eq(
                "voice_candidate_id", voice_candidate_id
            ).execute()

            if result.data:
                for pc in result.data:
                    self.client.table("pipeline_candidates").update({
                        "voice_status": status,
                    }).eq("id", pc["id"]).execute()
        except Exception as e:
            logger.warning(f"Pipeline sync (voice) failed for {voice_candidate_id}: {e}")

    # ── Pipeline board data ───────────────────────────────────────────────

    def get_pipeline_board(self, job_id: str, user_id: str, org_id: Optional[str] = None) -> dict:
        """Get all pipeline candidates grouped by stage for Kanban view."""
        user_id = self._resolve_user_id(user_id)
        logger.info(f"🔍 GET_PIPELINE_BOARD: job_id={job_id}, user_id={user_id}, org_id={org_id}")

        query = self.client.table("pipeline_candidates").select("*").eq("job_id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.is_("deleted_at", "null").order("created_at", desc=False).execute()

        candidates = result.data or []
        logger.info(f"📊 Found {len(candidates)} pipeline candidates for job {job_id}")

        board = {
            "resume_screening": [],
            "technical_assessment": [],
            "voice_screening": [],
            "completed": [],
        }

        for c in candidates:
            stage = c.get("current_stage", "resume_screening")
            if stage in board:
                board[stage].append(c)

        return board

    def get_pipeline_stats(self, job_id: str, user_id: str, org_id: Optional[str] = None) -> dict:
        """Get pipeline statistics for a job."""
        user_id = self._resolve_user_id(user_id)
        query = self.client.table("pipeline_candidates").select("*").eq("job_id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.is_("deleted_at", "null").execute()

        candidates = result.data or []
        total = len(candidates)

        stages = {"resume_screening": 0, "technical_assessment": 0, "voice_screening": 0, "completed": 0}
        recommendations = {"highly_recommended": 0, "recommended": 0, "not_recommended": 0, "pending": 0}
        decisions = {"pending": 0, "selected": 0, "rejected": 0, "hold": 0}

        for c in candidates:
            stage = c.get("current_stage", "resume_screening")
            rec = c.get("recommendation", "pending")
            dec = c.get("final_decision", "pending")

            if stage in stages:
                stages[stage] += 1
            if rec in recommendations:
                recommendations[rec] += 1
            if dec in decisions:
                decisions[dec] += 1

        return {
            "total": total,
            "stages": stages,
            "recommendations": recommendations,
            "decisions": decisions,
        }

    def get_pipeline_candidates(
        self, job_id: str, user_id: str, stage: Optional[str] = None, recommendation: Optional[str] = None, org_id: Optional[str] = None
    ) -> list[dict]:
        """List pipeline candidates with optional filters."""
        user_id = self._resolve_user_id(user_id)
        query = self.client.table("pipeline_candidates").select("*").eq("job_id", job_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        query = query.is_("deleted_at", "null")

        if stage:
            query = query.eq("current_stage", stage)
        if recommendation:
            query = query.eq("recommendation", recommendation)

        result = query.order("resume_match_score", desc=True).execute()
        return result.data or []

    # ── Decision ──────────────────────────────────────────────────────────

    def set_decision(self, candidate_id: str, user_id: str, decision: str, notes: Optional[str] = None, org_id: Optional[str] = None) -> dict:
        """Set final hiring decision on a pipeline candidate."""
        user_id = self._resolve_user_id(user_id)
        valid = ["pending", "selected", "rejected", "hold"]
        if decision not in valid:
            raise ValueError(f"Invalid decision. Must be one of: {valid}")

        query = self.client.table("pipeline_candidates").update({
            "final_decision": decision,
            "decision_notes": notes,
            "decided_by": user_id,
            "decided_at": "now()",
        }).eq("id", candidate_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.execute()

        if not result.data:
            raise ValueError("Pipeline candidate not found or access denied")

        return result.data[0]

    def delete_pipeline_candidate(self, candidate_id: str, user_id: str, org_id: Optional[str] = None) -> bool:
        """Soft-delete a candidate from the pipeline."""
        user_id = self._resolve_user_id(user_id)
        query = self.client.table("pipeline_candidates").update(
            {"deleted_at": "now()"}
        ).eq("id", candidate_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.execute()
        return bool(result.data)

    # ── Available targets ─────────────────────────────────────────────────

    def get_available_interviews(self, user_id: str, job_id: Optional[str] = None, org_id: Optional[str] = None) -> list[dict]:
        """List coding interviews available for promotion."""
        user_id = self._resolve_user_id(user_id)
        fields = "id, title, status, interview_type, programming_language, scheduled_start_time, job_id"

        def _build_query():
            q = self.client.table("coding_interviews").select(fields)
            if org_id:
                q = q.eq("org_id", org_id)
            else:
                q = q.eq("created_by", user_id)
            return q

        if job_id:
            linked = _build_query().eq("job_id", job_id).in_(
                "status", ["scheduled", "in_progress"]
            ).order("created_at", desc=True).execute()

            unlinked = _build_query().is_("job_id", "null").in_(
                "status", ["scheduled", "in_progress"]
            ).order("created_at", desc=True).execute()

            return (linked.data or []) + (unlinked.data or [])

        result = _build_query().in_(
            "status", ["scheduled", "in_progress"]
        ).order("created_at", desc=True).execute()
        return result.data or []

    def get_available_campaigns(self, user_id: str, job_id: Optional[str] = None, org_id: Optional[str] = None) -> list[dict]:
        """List voice screening campaigns available for promotion."""
        user_id = self._resolve_user_id(user_id)
        fields = "id, name, job_role, is_active, candidate_type, interview_style, job_id"

        def _build_query():
            q = self.client.table("voice_screening_campaigns").select(fields)
            if org_id:
                q = q.eq("org_id", org_id)
            else:
                q = q.eq("created_by", user_id)
            return q

        if job_id:
            linked = _build_query().eq("job_id", job_id).eq("is_active", True).order(
                "created_at", desc=True
            ).execute()

            unlinked = _build_query().is_("job_id", "null").eq("is_active", True).order(
                "created_at", desc=True
            ).execute()

            return (linked.data or []) + (unlinked.data or [])

        result = _build_query().eq("is_active", True).order(
            "created_at", desc=True
        ).execute()
        return result.data or []


# Singleton
_instance = None


def get_pipeline_service() -> PipelineService:
    global _instance
    if _instance is None:
        _instance = PipelineService()
    return _instance
