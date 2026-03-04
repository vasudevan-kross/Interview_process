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
                "raw_text": extracted_text,
                "file_path": storage_result['file_path'],
                "file_type": validation['file_type'],
                "file_size": validation['file_size'],
                "created_by": user_id,
                "parsed_data": {
                    "skills_required": skills_result['skills'],
                    "file_name": filename,
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
                "metadata": job_data['parsed_data']
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

            # Extract candidate info if not provided
            if not candidate_name or not candidate_email:
                logger.info("Extracting candidate information from resume text")
                candidate_info_result = await self.llm.extract_candidate_info(
                    extracted_text,
                    model=model
                )

                # Use extracted info if original values are not provided
                if not candidate_name:
                    candidate_name = candidate_info_result.get('candidate_name')
                if not candidate_email:
                    candidate_email = candidate_info_result.get('candidate_email')

                # Store phone if extracted
                candidate_phone = candidate_info_result.get('candidate_phone')
            else:
                candidate_phone = None

            # Extract skills using LLM
            skills_result = await self.llm.extract_skills_from_text(
                extracted_text,
                model=model
            )

            # Create resume record
            resume_data = {
                "id": str(uuid4()),
                "job_description_id": job_id,
                "candidate_name": candidate_name or "Unknown",
                "candidate_email": candidate_email,
                "candidate_phone": candidate_phone,
                "raw_text": extracted_text,
                "file_path": storage_result['file_path'],
                "file_type": validation['file_type'],
                "file_size": validation['file_size'],
                "uploaded_by": user_id,
                "parsed_data": {
                    "skills_extracted": skills_result['skills'],
                    "file_name": filename,
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
                "raw_text"
            ).eq("id", job_id).single().execute()

            if job_result.data:
                match_result = await self.llm.calculate_match_score(
                    job_description=job_result.data['raw_text'],
                    resume=extracted_text,
                    model=model
                )

                # Update resume with match score
                self.client.table("resumes").update({
                    "match_score": float(match_result['match_score']) if match_result.get('match_score') is not None else 0,
                    "skill_match": {
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
                "match_score": float(match_result.get('match_score', 0)) if match_result.get('match_score') is not None else 0.0,
                "match_details": {
                    "key_matches": match_result.get('key_matches', []),
                    "missing_requirements": match_result.get('missing_requirements', []),
                    "reasoning": match_result.get('reasoning', '')
                },
                "file_info": storage_result,
                "metadata": resume_data['parsed_data']
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
                "id, candidate_name, candidate_email, match_score, skill_match, parsed_data, created_at"
            ).eq("job_description_id", job_id).order(
                "match_score", desc=True
            ).limit(limit).execute()

            # Transform data to match CandidateInfo schema
            candidates = []
            for resume in (result.data or []):
                candidates.append({
                    "id": resume["id"],
                    "candidate_name": resume["candidate_name"],
                    "candidate_email": resume.get("candidate_email"),
                    "match_score": resume.get("match_score"),
                    "match_details": resume.get("skill_match"),  # Map skill_match to match_details
                    "skills_extracted": resume.get("parsed_data", {}).get("skills_extracted", {}),  # Extract from parsed_data
                    "created_at": resume["created_at"]
                })

            return candidates

        except Exception as e:
            logger.error(f"Error getting ranked candidates: {e}")
            raise

    async def get_job_description(self, job_id: str) -> Dict[str, Any]:
        """
        Get job description details by ID.

        Args:
            job_id: Job description ID

        Returns:
            dict with job description details including raw_text
        """
        try:
            result = self.client.table("job_descriptions").select("*").eq("id", job_id).single().execute()
            if not result.data:
                raise ValueError(f"Job description with ID {job_id} not found")
            return result.data
        except Exception as e:
            logger.error(f"Error getting job description: {e}")
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
                    "lowest_score": 0,
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

    async def delete_resumes(self, resume_ids: List[str]) -> Dict[str, Any]:
        """
        Delete multiple resumes by their IDs.

        Args:
            resume_ids: List of resume IDs to delete

        Returns:
            dict with deleted_count and failed_ids
        """
        try:
            deleted_count = 0
            failed_ids = []

            for resume_id in resume_ids:
                try:
                    # Get resume data before deletion
                    resume_result = self.client.table("resumes").select(
                        "file_path"
                    ).eq("id", resume_id).single().execute()

                    if resume_result.data:
                        file_path = resume_result.data.get('file_path')

                        # Delete from database
                        self.client.table("resumes").delete().eq("id", resume_id).execute()

                        # Delete vector embedding
                        try:
                            await self.vector_store.delete_resume_embedding(resume_id)
                        except Exception as e:
                            logger.warning(f"Failed to delete embedding for resume {resume_id}: {e}")

                        # Delete file from storage
                        if file_path:
                            try:
                                await self.storage.delete_file(file_path)
                            except Exception as e:
                                logger.warning(f"Failed to delete file for resume {resume_id}: {e}")

                        deleted_count += 1
                        logger.info(f"Deleted resume: {resume_id}")
                    else:
                        logger.warning(f"Resume not found: {resume_id}")
                        failed_ids.append(resume_id)

                except Exception as e:
                    logger.error(f"Error deleting resume {resume_id}: {e}")
                    failed_ids.append(resume_id)

            return {
                "deleted_count": deleted_count,
                "failed_ids": failed_ids
            }

        except Exception as e:
            logger.error(f"Error in delete_resumes: {e}")
            raise


# Singleton instance
_resume_matching_service: Optional[ResumeMatchingService] = None


def get_resume_matching_service() -> ResumeMatchingService:
    """Get the resume matching service singleton."""
    global _resume_matching_service
    if _resume_matching_service is None:
        _resume_matching_service = ResumeMatchingService()
    return _resume_matching_service
