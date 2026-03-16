"""Automatically process and link resumes uploaded during coding interviews."""

import logging
from typing import Optional, Dict
import httpx
from app.db.supabase_client import get_supabase
from app.services.resume_parser_llm import ResumeParserLLM
from app.services.resume_matching_llm import ResumeMatchingServiceLLM

logger = logging.getLogger(__name__)


class ResumeAutoProcessor:
    """Process resumes uploaded during coding interviews and link to pipeline."""

    def __init__(self):
        self.client = get_supabase()
        self.parser = ResumeParserLLM()
        self.matcher = ResumeMatchingServiceLLM()

    async def process_coding_interview_resume(
        self,
        submission_id: str
    ) -> Optional[Dict]:
        """
        Process resume from coding submission and link to pipeline.

        Args:
            submission_id: UUID of coding_submission

        Returns:
            Dict with processing results or None if no resume/pipeline candidate
        """
        try:
            # 1. Get submission data
            submission = self.client.table("coding_submissions").select(
                "id, candidate_email, resume_path, interview_id"
            ).eq("id", submission_id).single().execute()

            if not submission.data or not submission.data.get("resume_path"):
                logger.info(f"No resume found for submission {submission_id}")
                return None

            # 2. Get interview and job_id
            interview = self.client.table("coding_interviews").select(
                "id, job_id"
            ).eq("id", submission.data["interview_id"]).single().execute()

            if not interview.data or not interview.data.get("job_id"):
                logger.warning(f"No job_id linked to interview {submission.data['interview_id']}")
                return None

            job_id = interview.data["job_id"]
            candidate_email = submission.data["candidate_email"]

            # 3. Find pipeline candidate
            pipeline_candidate = self.client.table("pipeline_candidates").select(
                "id, resume_id, created_by, org_id"
            ).eq("job_id", job_id).eq("candidate_email", candidate_email).execute()

            if not pipeline_candidate.data:
                logger.info(f"No pipeline candidate found for {candidate_email} in job {job_id}")
                return None

            pipeline_id = pipeline_candidate.data[0]["id"]
            existing_resume_id = pipeline_candidate.data[0].get("resume_id")

            # Skip if already has resume
            if existing_resume_id:
                logger.info(f"Pipeline candidate {pipeline_id} already has resume {existing_resume_id}")
                return None

            # 4. Download resume from storage
            resume_path = submission.data["resume_path"]

            # Get signed URL for download
            signed_url_response = self.client.storage.from_("documents").create_signed_url(
                resume_path,
                expires_in=300  # 5 minutes
            )

            if not signed_url_response.get("signedURL"):
                logger.error(f"Failed to get signed URL for {resume_path}")
                return None

            resume_url = signed_url_response["signedURL"]

            # Download file content
            async with httpx.AsyncClient(timeout=30.0) as http_client:
                response = await http_client.get(resume_url)
                response.raise_for_status()
                resume_bytes = response.content

            # 5. Parse resume
            logger.info(f"Parsing resume for {candidate_email}")
            parsed_data = await self.parser.parse_resume(resume_bytes, candidate_email)

            # 6. Get job description
            job = self.client.table("job_descriptions").select(
                "id, title, raw_text, required_skills, preferred_skills, processed_data"
            ).eq("id", job_id).single().execute()

            if not job.data:
                logger.error(f"Job {job_id} not found")
                return None

            # 7. Score resume against job
            logger.info(f"Scoring resume for {candidate_email}")
            match_result = await self.matcher.match_with_job(parsed_data, job.data)

            # 8. Create resume entry
            resume_record = {
                "job_description_id": job_id,
                "file_path": resume_path,  # Reference to coding submission upload
                "candidate_name": parsed_data.get("name") or candidate_email,
                "candidate_email": candidate_email,
                "candidate_phone": parsed_data.get("phone"),
                "match_score": match_result["match_score"],
                "parsed_data": parsed_data,
                "created_by": pipeline_candidate.data[0].get("created_by")  # Inherit from pipeline
            }

            # Add org_id if available
            if pipeline_candidate.data[0].get("org_id"):
                resume_record["org_id"] = pipeline_candidate.data[0]["org_id"]

            resume_insert = self.client.table("resumes").insert(resume_record).execute()
            new_resume_id = resume_insert.data[0]["id"]

            # 9. Update pipeline candidate
            self.client.table("pipeline_candidates").update({
                "resume_id": new_resume_id,
                "resume_match_score": match_result["match_score"],
                "recommendation": self._determine_recommendation(match_result["match_score"])
            }).eq("id", pipeline_id).execute()

            logger.info(f"✅ Linked resume {new_resume_id} to pipeline candidate {pipeline_id}")

            return {
                "resume_id": new_resume_id,
                "pipeline_id": pipeline_id,
                "match_score": match_result["match_score"]
            }

        except Exception as e:
            logger.error(f"Error processing resume for submission {submission_id}: {str(e)}")
            return None

    def _determine_recommendation(self, score: float) -> str:
        """Determine recommendation based on score."""
        if score >= 85:
            return "highly_recommended"
        elif score >= 65:
            return "recommended"
        else:
            return "not_recommended"


def get_resume_auto_processor():
    """Dependency injection for resume auto processor."""
    return ResumeAutoProcessor()
