"""
Candidate Statistics Service: Generate comprehensive assessment reports for individual candidates.

Aggregates data from:
- Resume screening (match scores)
- Technical assessments (coding submissions)
- Voice screening (call history and transcripts)
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from app.db.supabase_client import get_supabase
from app.services.user_service import get_user_service

logger = logging.getLogger(__name__)


class CandidateStatisticsService:
    """Generates detailed statistics and reports for individual candidates."""

    def __init__(self):
        self.client = get_supabase()
        self.user_service = get_user_service()

    def _resolve_user_id(self, auth_user_id: str) -> str:
        """Resolve Supabase auth UUID to the users table ID."""
        return self.user_service.resolve_user_id(auth_user_id)

    def get_candidate_statistics(
        self, candidate_id: str, org_id: str, user_id: str
    ) -> Dict[str, Any]:
        """
        Get comprehensive statistics for a pipeline candidate.

        Returns detailed metrics including:
        - Basic candidate info
        - Resume screening results
        - Technical assessment performance
        - Voice screening results
        - Timeline and progression
        - Comparative analytics
        """
        user_id = self._resolve_user_id(user_id)

        # Get pipeline candidate with all related data
        # Note: Simplified query - focuses on coding statistics
        result = self.client.table("pipeline_candidates").select(
            """
            *,
            job_descriptions:job_id (
                id,
                title,
                department,
                experience_required
            ),
            resumes:resume_id (
                id,
                match_score,
                skill_match,
                experience_match,
                llm_analysis,
                parsed_data,
                created_at
            ),
            coding_submissions:coding_submission_id (
                id,
                total_marks_obtained,
                percentage,
                status,
                started_at,
                submitted_at,
                session_duration_seconds,
                late_submission,
                suspicious_activity,
                coding_answers (
                    question_id,
                    submitted_code,
                    programming_language,
                    marks_awarded,
                    coding_questions (
                        id,
                        question_text,
                        difficulty,
                        marks
                    )
                )
            ),
            hiring_campaigns:campaign_id (
                id,
                name,
                status
            )
            """
        ).eq("id", candidate_id).eq("org_id", org_id).execute()

        if not result.data or len(result.data) == 0:
            raise ValueError("Candidate not found or access denied")

        candidate = result.data[0]

        # Build comprehensive statistics
        stats = self._build_statistics(candidate, org_id)

        return stats

    def _build_statistics(self, candidate: Dict, org_id: str) -> Dict[str, Any]:
        """Build comprehensive statistics from candidate data."""

        # Basic Info
        basic_info = {
            "id": candidate["id"],
            "name": candidate["candidate_name"],
            "email": candidate["candidate_email"],
            "phone": candidate.get("candidate_phone"),
            "current_stage": candidate["current_stage"],
            "recommendation": candidate.get("recommendation"),
            "final_decision": candidate.get("final_decision"),
            "decision_notes": candidate.get("decision_notes"),
            "created_at": candidate.get("created_at"),
            "updated_at": candidate.get("updated_at"),
        }

        # Job Details
        job_data = candidate.get("job_descriptions") or {}
        job_info = {
            "id": job_data.get("id"),
            "title": job_data.get("title"),
            "department": job_data.get("department"),
            "experience_required": job_data.get("experience_required"),
        }

        # Campaign Info
        campaign_data = candidate.get("hiring_campaigns") or {}
        campaign_info = {
            "id": campaign_data.get("id"),
            "name": campaign_data.get("name"),
            "status": campaign_data.get("status"),
        } if campaign_data else None

        # Resume Screening Stats
        resume_stats = self._get_resume_statistics(candidate.get("resumes"))

        # Technical Assessment Stats
        technical_stats = self._get_technical_statistics(
            candidate.get("coding_submissions")
        )

        # Voice Screening Stats
        voice_stats = self._get_voice_statistics(candidate.get("voice_candidates"))

        # Timeline & Progression
        timeline = self._build_timeline(candidate)

        # Overall Performance Summary
        overall_summary = self._calculate_overall_performance(
            resume_stats, technical_stats, voice_stats
        )

        # Comparative Analytics (how they rank among other candidates)
        comparative = self._get_comparative_analytics(
            candidate, job_data.get("id"), org_id
        )

        return {
            "candidate": basic_info,
            "job": job_info,
            "campaign": campaign_info,
            "resume_screening": resume_stats,
            "technical_assessment": technical_stats,
            "voice_screening": voice_stats,
            "timeline": timeline,
            "overall_performance": overall_summary,
            "comparative_analytics": comparative,
        }

    def _get_resume_statistics(self, resume_data: Optional[Dict]) -> Dict[str, Any]:
        """Extract resume screening statistics."""
        if not resume_data:
            return {"completed": False}

        skill_match = resume_data.get("skill_match") or {}
        experience_match = resume_data.get("experience_match") or {}
        parsed_data = resume_data.get("parsed_data") or {}

        return {
            "completed": True,
            "match_score": resume_data.get("match_score"),
            "screened_at": resume_data.get("created_at"),
            "skills_found": skill_match.get("matched_skills", []),
            "skills_missing": skill_match.get("missing_skills", []),
            "total_experience_years": parsed_data.get("total_experience"),
            "experience_analysis": experience_match,
            "llm_analysis": resume_data.get("llm_analysis"),
            "key_strengths": parsed_data.get("key_strengths", []),
            "education": parsed_data.get("education", []),
        }

    def _get_technical_statistics(
        self, submission_data: Optional[Dict]
    ) -> Dict[str, Any]:
        """Extract technical assessment statistics."""
        if not submission_data:
            return {"completed": False}

        coding_answers = submission_data.get("coding_answers") or []

        # Calculate question-level stats
        questions_stats = []
        total_questions = len(coding_answers)
        questions_attempted = 0
        questions_fully_correct = 0

        for answer in coding_answers:
            question_info = answer.get("coding_questions") or {}
            # Use marks_awarded (actual field name)
            marks_obtained = answer.get("marks_awarded") or 0
            # max_marks comes from the question's marks field
            max_marks = question_info.get("marks") or 0

            # Use submitted_code (actual field name)
            attempted = bool(answer.get("submitted_code"))
            if attempted:
                questions_attempted += 1

            if max_marks > 0 and marks_obtained == max_marks:
                questions_fully_correct += 1

            # Get question title - truncate if too long
            question_text = question_info.get("question_text", "")
            title = question_text[:50] + "..." if len(question_text) > 50 else question_text or "Question"

            questions_stats.append({
                "question_id": answer.get("question_id"),
                "title": title,
                "difficulty": question_info.get("difficulty", "medium"),
                "language": answer.get("programming_language", "-"),  # Use programming_language
                "marks_obtained": marks_obtained,
                "max_marks": max_marks,
                "percentage": (marks_obtained / max_marks * 100) if max_marks > 0 else 0,
                "attempted": attempted,
                "fully_correct": marks_obtained == max_marks if max_marks > 0 else False,
            })

        # Calculate duration
        started_at = submission_data.get("started_at")
        submitted_at = submission_data.get("submitted_at")
        duration_seconds = submission_data.get("session_duration_seconds") or 0

        if started_at and submitted_at:
            try:
                start_time = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                end_time = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
                duration_seconds = int((end_time - start_time).total_seconds())
            except Exception as e:
                logger.warning(f"Could not calculate duration: {e}")

        return {
            "completed": True,
            "status": submission_data.get("status"),
            "started_at": started_at,
            "submitted_at": submitted_at,
            "duration_seconds": duration_seconds,
            "duration_formatted": self._format_duration(duration_seconds),
            "total_score": submission_data.get("total_marks_obtained"),
            "percentage": submission_data.get("percentage"),
            "late_submission": submission_data.get("late_submission"),
            "suspicious_activity": submission_data.get("suspicious_activity"),
            "questions": {
                "total": total_questions,
                "attempted": questions_attempted,
                "fully_correct": questions_fully_correct,
                "attempt_rate": (questions_attempted / total_questions * 100)
                if total_questions > 0
                else 0,
                "accuracy_rate": (questions_fully_correct / questions_attempted * 100)
                if questions_attempted > 0
                else 0,
                "details": questions_stats,
            },
        }

    def _get_voice_statistics(
        self, voice_data: Optional[Dict]
    ) -> Dict[str, Any]:
        """Extract voice screening statistics."""
        # Simplified: Voice screening not included in main query (focusing on coding statistics)
        # If you need voice data, add voice_candidates back to the select query above
        return {"completed": False}

    def _build_timeline(self, candidate: Dict) -> List[Dict[str, Any]]:
        """Build candidate progression timeline."""
        timeline = []

        # Candidate created
        if candidate.get("created_at"):
            timeline.append({
                "stage": "application",
                "event": "Application Submitted",
                "timestamp": candidate.get("created_at"),
                "status": "completed",
            })

        # Resume screening
        resume_data = candidate.get("resumes")
        if resume_data and resume_data.get("created_at"):
            timeline.append({
                "stage": "resume_screening",
                "event": "Resume Screened",
                "timestamp": resume_data.get("created_at"),
                "score": resume_data.get("match_score"),
                "status": "completed",
            })

        # Technical assessment
        submission_data = candidate.get("coding_submissions")
        if submission_data:
            if submission_data.get("started_at"):
                timeline.append({
                    "stage": "technical_assessment",
                    "event": "Technical Assessment Started",
                    "timestamp": submission_data.get("started_at"),
                    "status": "in_progress" if not submission_data.get("submitted_at") else "completed",
                })
            if submission_data.get("submitted_at"):
                timeline.append({
                    "stage": "technical_assessment",
                    "event": "Technical Assessment Submitted",
                    "timestamp": submission_data.get("submitted_at"),
                    "score": submission_data.get("percentage"),
                    "status": "completed",
                })

        # Voice screening - skipped (not queried)
        # If you need voice timeline, add voice_candidates back to the select query

        # Final decision
        if candidate.get("decided_at"):
            timeline.append({
                "stage": "decision",
                "event": f"Decision: {candidate.get('final_decision')}",
                "timestamp": candidate.get("decided_at"),
                "notes": candidate.get("decision_notes"),
                "status": "completed",
            })

        # Sort by timestamp
        timeline.sort(key=lambda x: x.get("timestamp") or "")

        return timeline

    def _calculate_overall_performance(
        self, resume_stats: Dict, technical_stats: Dict, voice_stats: Dict
    ) -> Dict[str, Any]:
        """Calculate overall performance summary."""

        # Collect scores
        scores = []
        weights = []

        if resume_stats.get("completed") and resume_stats.get("match_score"):
            scores.append(resume_stats["match_score"])
            weights.append(0.3)  # 30% weight for resume

        if technical_stats.get("completed") and technical_stats.get("percentage"):
            scores.append(technical_stats["percentage"])
            weights.append(0.5)  # 50% weight for technical

        # Voice screening doesn't have numeric score, so we use completion as indicator
        voice_weight = 0.2
        if voice_stats.get("completed"):
            if voice_stats.get("status") == "completed":
                # Assume completed voice = 80% score
                scores.append(80.0)
                weights.append(voice_weight)

        # Calculate weighted average
        if not scores:
            return {
                "overall_score": None,
                "stages_completed": 0,
                "stages_total": 3,
                "completion_rate": 0,
                "rating": "Not Started",
            }

        # Normalize weights
        total_weight = sum(weights)
        normalized_weights = [w / total_weight for w in weights]

        overall_score = sum(s * w for s, w in zip(scores, normalized_weights))

        # Calculate completion
        stages_completed = sum([
            1 if resume_stats.get("completed") else 0,
            1 if technical_stats.get("completed") else 0,
            1 if voice_stats.get("completed") else 0,
        ])

        # Determine rating
        if overall_score >= 85:
            rating = "Excellent"
        elif overall_score >= 75:
            rating = "Very Good"
        elif overall_score >= 65:
            rating = "Good"
        elif overall_score >= 50:
            rating = "Average"
        else:
            rating = "Below Average"

        return {
            "overall_score": round(overall_score, 2),
            "stages_completed": stages_completed,
            "stages_total": 3,
            "completion_rate": round((stages_completed / 3) * 100, 2),
            "rating": rating,
            "score_breakdown": {
                "resume": resume_stats.get("match_score"),
                "technical": technical_stats.get("percentage"),
                "voice": "Completed" if voice_stats.get("completed") else "Not Started",
            },
        }

    def _get_comparative_analytics(
        self, candidate: Dict, job_id: Optional[str], org_id: str
    ) -> Dict[str, Any]:
        """Get how candidate ranks compared to others in same job."""
        if not job_id:
            return {"available": False}

        # Get all candidates for this job
        result = self.client.table("pipeline_candidates").select(
            "id, resume_match_score, coding_percentage, current_stage"
        ).eq("job_id", job_id).eq("org_id", org_id).is_("deleted_at", "null").execute()

        if not result.data or len(result.data) < 2:
            return {"available": False, "reason": "Not enough candidates to compare"}

        all_candidates = result.data
        total_candidates = len(all_candidates)

        # Calculate rankings
        resume_scores = [c.get("resume_match_score") or 0 for c in all_candidates]
        coding_scores = [c.get("coding_percentage") or 0 for c in all_candidates if c.get("coding_percentage")]

        candidate_resume_score = candidate.get("resume_match_score") or 0
        candidate_coding_score = candidate.get("coding_percentage") or 0

        # Resume ranking
        resume_scores_sorted = sorted(resume_scores, reverse=True)
        resume_rank = resume_scores_sorted.index(candidate_resume_score) + 1 if candidate_resume_score in resume_scores_sorted else None
        resume_percentile = ((total_candidates - resume_rank + 1) / total_candidates * 100) if resume_rank else None

        # Coding ranking
        coding_rank = None
        coding_percentile = None
        if coding_scores and candidate_coding_score:
            coding_scores_sorted = sorted(coding_scores, reverse=True)
            coding_rank = coding_scores_sorted.index(candidate_coding_score) + 1 if candidate_coding_score in coding_scores_sorted else None
            coding_percentile = ((len(coding_scores) - coding_rank + 1) / len(coding_scores) * 100) if coding_rank else None

        # Stage distribution
        stage_counts = {}
        for c in all_candidates:
            stage = c.get("current_stage") or "unknown"
            stage_counts[stage] = stage_counts.get(stage, 0) + 1

        return {
            "available": True,
            "total_candidates": total_candidates,
            "resume_screening": {
                "rank": resume_rank,
                "percentile": round(resume_percentile, 1) if resume_percentile else None,
                "average_score": round(sum(resume_scores) / len(resume_scores), 2) if resume_scores else None,
                "top_score": max(resume_scores) if resume_scores else None,
            },
            "technical_assessment": {
                "rank": coding_rank,
                "percentile": round(coding_percentile, 1) if coding_percentile else None,
                "average_score": round(sum(coding_scores) / len(coding_scores), 2) if coding_scores else None,
                "top_score": max(coding_scores) if coding_scores else None,
                "total_attempted": len(coding_scores),
            } if coding_scores else None,
            "stage_distribution": stage_counts,
        }

    def _format_duration(self, seconds: int) -> str:
        """Format seconds into human-readable duration."""
        if not seconds:
            return "0s"

        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60

        parts = []
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        if secs > 0 or not parts:
            parts.append(f"{secs}s")

        return " ".join(parts)


# ── Singleton Pattern ─────────────────────────────────────────────────────

_candidate_statistics_service: Optional[CandidateStatisticsService] = None


def get_candidate_statistics_service() -> CandidateStatisticsService:
    """Get singleton instance of CandidateStatisticsService."""
    global _candidate_statistics_service
    if _candidate_statistics_service is None:
        _candidate_statistics_service = CandidateStatisticsService()
    return _candidate_statistics_service
