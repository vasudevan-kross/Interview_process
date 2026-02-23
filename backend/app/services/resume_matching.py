"""
Resume matching service - orchestrates the complete resume matching workflow.
Handles job description upload, resume processing, skill extraction, and scoring.
"""
from typing import List, Dict, Optional, Any
import logging
from datetime import datetime
from uuid import uuid4

from app.services.storage_service import get_storage_service
from app.services.document_processor import get_document_processor
from app.services.vector_store import get_vector_store
from app.services.llm_orchestrator import get_llm_orchestrator
from app.db.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)


class ResumeMatchingService:
    """Service for matching resumes to job descriptions."""

    def __init__(self):
        """Initialize the resume matching service."""
        self.storage = get_storage_service()
        self.doc_processor = get_document_processor()
        self.vector_store = get_vector_store()
        self.llm = get_llm_orchestrator()
        self.client = get_supabase()

    async def process_job_description(
        self,
        file_data: bytes,
        filename: str,
        user_id: str,
        title: str,
        department: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a job description file.

        Args:
            file_data: File content as bytes
            filename: Original filename
            user_id: User ID who uploaded the file
            title: Job title
            department: Department name
            model: Optional LLM model override

        Returns:
            dict with job_id, extracted_text, skills, etc.
        """
        try:
            # Validate file
            validation = await self.doc_processor.validate_file(
                file_data,
                filename,
                max_size=settings.MAX_UPLOAD_SIZE
            )

            if not validation['is_valid']:
                raise ValueError(f"File validation failed: {validation['errors']}")

            # Extract text from document
            extraction = await self.doc_processor.extract_text(
                file_data,
                filename,
                validation['file_type']
            )

            extracted_text = extraction['extracted_text']

            if not extracted_text or len(extracted_text.strip()) < 50:
                raise ValueError("Insufficient text content in job description")

            # Upload file to storage
            storage_result = await self.storage.upload_file(
                file_data=file_data,
                filename=filename,
                bucket_type="job_descriptions",
                user_id=user_id,
                content_type=f"application/{validation['file_type']}"
            )

            # Extract skills using LLM
            skills_result = await self.llm.extract_skills_from_text(
                extracted_text,
                model=model
            )

            # Create job description record
            job_data = {
                "id": str(uuid4()),
                "title": title,
                "department": department,
                "description": extracted_text,
                "file_path": storage_result['file_path'],
                "file_name": filename,
                "created_by": user_id,
                "skills_required": skills_result['skills'],
                "metadata": {
                    "file_type": validation['file_type'],
                    "file_size": validation['file_size'],
                    "extraction_metadata": extraction,
                    "model_used": skills_result.get('model_used')
                }
            }

            # Insert into database
            result = self.client.table("job_descriptions").insert(job_data).execute()

            job_id = job_data['id']

            # Generate and store embedding
            await self.vector_store.store_job_description_embedding(
                job_id=job_id,
                text=extracted_text,
                metadata={"title": title, "department": department}
            )

            logger.info(f"Processed job description: {job_id}")

            return {
                "job_id": job_id,
                "title": title,
                "extracted_text": extracted_text,
                "skills": skills_result['skills'],
                "file_info": storage_result,
                "metadata": job_data['metadata']
            }

        except Exception as e:
            logger.error(f"Error processing job description: {e}")
            raise

    async def process_resume(
        self,
        file_data: bytes,
        filename: str,
        user_id: str,
        job_id: str,
        candidate_name: Optional[str] = None,
        candidate_email: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a single resume file.

        Args:
            file_data: File content as bytes
            filename: Original filename
            user_id: User ID who uploaded the file
            job_id: Job description ID to match against
            candidate_name: Optional candidate name
            candidate_email: Optional candidate email
            model: Optional LLM model override

        Returns:
            dict with resume_id, extracted_text, skills, match_score, etc.
        """
        try:
            # Validate file
            validation = await self.doc_processor.validate_file(
                file_data,
                filename,
                max_size=settings.MAX_UPLOAD_SIZE
            )

            if not validation['is_valid']:
                raise ValueError(f"File validation failed: {validation['errors']}")

            # Extract text from document
            extraction = await self.doc_processor.extract_text(
                file_data,
                filename,
                validation['file_type']
            )

            extracted_text = extraction['extracted_text']

            if not extracted_text or len(extracted_text.strip()) < 50:
                raise ValueError("Insufficient text content in resume")

            # Upload file to storage
            storage_result = await self.storage.upload_file(
                file_data=file_data,
                filename=filename,
                bucket_type="resumes",
                user_id=user_id,
                content_type=f"application/{validation['file_type']}"
            )

            # Extract skills using LLM
            skills_result = await self.llm.extract_skills_from_text(
                extracted_text,
                model=model
            )

            # Create resume record
            resume_data = {
                "id": str(uuid4()),
                "job_id": job_id,
                "candidate_name": candidate_name or "Unknown",
                "candidate_email": candidate_email,
                "resume_text": extracted_text,
                "file_path": storage_result['file_path'],
                "file_name": filename,
                "uploaded_by": user_id,
                "skills_extracted": skills_result['skills'],
                "metadata": {
                    "file_type": validation['file_type'],
                    "file_size": validation['file_size'],
                    "extraction_metadata": extraction,
                    "model_used": skills_result.get('model_used')
                }
            }

            # Insert into database
            result = self.client.table("resumes").insert(resume_data).execute()

            resume_id = resume_data['id']

            # Generate and store embedding
            await self.vector_store.store_resume_embedding(
                resume_id=resume_id,
                text=extracted_text,
                metadata={"candidate_name": candidate_name, "filename": filename}
            )

            # Calculate match score with job description
            job_result = self.client.table("job_descriptions").select(
                "description"
            ).eq("id", job_id).single().execute()

            if job_result.data:
                match_result = await self.llm.calculate_match_score(
                    job_description=job_result.data['description'],
                    resume=extracted_text,
                    model=model
                )

                # Update resume with match score
                self.client.table("resumes").update({
                    "match_score": match_result['match_score'],
                    "match_details": {
                        "key_matches": match_result.get('key_matches', []),
                        "missing_requirements": match_result.get('missing_requirements', []),
                        "reasoning": match_result.get('reasoning', '')
                    }
                }).eq("id", resume_id).execute()

            else:
                match_result = {"match_score": 0, "error": "Job description not found"}

            logger.info(f"Processed resume: {resume_id} with match score: {match_result.get('match_score', 0)}")

            return {
                "resume_id": resume_id,
                "candidate_name": candidate_name,
                "extracted_text": extracted_text,
                "skills": skills_result['skills'],
                "match_score": match_result.get('match_score', 0),
                "match_details": {
                    "key_matches": match_result.get('key_matches', []),
                    "missing_requirements": match_result.get('missing_requirements', []),
                    "reasoning": match_result.get('reasoning', '')
                },
                "file_info": storage_result,
                "metadata": resume_data['metadata']
            }

        except Exception as e:
            logger.error(f"Error processing resume: {e}")
            raise

    async def process_multiple_resumes(
        self,
        resumes: List[Dict[str, Any]],
        job_id: str,
        user_id: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process multiple resumes for a job.

        Args:
            resumes: List of dicts with file_data, filename, candidate_name, candidate_email
            job_id: Job description ID
            user_id: User ID who uploaded files
            model: Optional LLM model override

        Returns:
            dict with results, summary, and ranked candidates
        """
        try:
            results = []
            failed = []

            for resume_data in resumes:
                try:
                    result = await self.process_resume(
                        file_data=resume_data['file_data'],
                        filename=resume_data['filename'],
                        user_id=user_id,
                        job_id=job_id,
                        candidate_name=resume_data.get('candidate_name'),
                        candidate_email=resume_data.get('candidate_email'),
                        model=model
                    )
                    results.append(result)

                except Exception as e:
                    logger.error(f"Failed to process resume {resume_data.get('filename')}: {e}")
                    failed.append({
                        "filename": resume_data.get('filename'),
                        "error": str(e)
                    })

            # Sort by match score (descending)
            results.sort(key=lambda x: x.get('match_score', 0), reverse=True)

            return {
                "total_processed": len(results),
                "total_failed": len(failed),
                "results": results,
                "failed": failed,
                "top_candidates": results[:5],  # Top 5 matches
                "summary": {
                    "highest_score": results[0]['match_score'] if results else 0,
                    "lowest_score": results[-1]['match_score'] if results else 0,
                    "average_score": sum(r['match_score'] for r in results) / len(results) if results else 0
                }
            }

        except Exception as e:
            logger.error(f"Error processing multiple resumes: {e}")
            raise

    async def get_ranked_candidates(
        self,
        job_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get ranked list of candidates for a job.

        Args:
            job_id: Job description ID
            limit: Maximum number of candidates

        Returns:
            List of candidates sorted by match score
        """
        try:
            result = self.client.table("resumes").select(
                "id, candidate_name, candidate_email, match_score, match_details, skills_extracted, created_at"
            ).eq("job_id", job_id).order(
                "match_score", desc=True
            ).limit(limit).execute()

            return result.data if result.data else []

        except Exception as e:
            logger.error(f"Error getting ranked candidates: {e}")
            raise

    async def get_job_statistics(self, job_id: str) -> Dict[str, Any]:
        """
        Get statistics for a job posting.

        Args:
            job_id: Job description ID

        Returns:
            dict with statistics
        """
        try:
            # Get all resumes for this job
            resumes = await self.get_ranked_candidates(job_id, limit=1000)

            if not resumes:
                return {
                    "total_resumes": 0,
                    "average_score": 0,
                    "top_score": 0,
                    "score_distribution": {}
                }

            scores = [r['match_score'] for r in resumes if r.get('match_score') is not None]

            # Calculate score distribution
            score_ranges = {
                "90-100": 0,
                "80-89": 0,
                "70-79": 0,
                "60-69": 0,
                "below_60": 0
            }

            for score in scores:
                if score >= 90:
                    score_ranges["90-100"] += 1
                elif score >= 80:
                    score_ranges["80-89"] += 1
                elif score >= 70:
                    score_ranges["70-79"] += 1
                elif score >= 60:
                    score_ranges["60-69"] += 1
                else:
                    score_ranges["below_60"] += 1

            return {
                "total_resumes": len(resumes),
                "average_score": sum(scores) / len(scores) if scores else 0,
                "top_score": max(scores) if scores else 0,
                "lowest_score": min(scores) if scores else 0,
                "score_distribution": score_ranges
            }

        except Exception as e:
            logger.error(f"Error getting job statistics: {e}")
            raise


# Singleton instance
_resume_matching_service: Optional[ResumeMatchingService] = None


def get_resume_matching_service() -> ResumeMatchingService:
    """Get the resume matching service singleton."""
    global _resume_matching_service
    if _resume_matching_service is None:
        _resume_matching_service = ResumeMatchingService()
    return _resume_matching_service
