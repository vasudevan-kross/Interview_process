"""
LLM-based Resume Matching Service.

Replaces the PyTorch-based approach with LLM-only matching.
No vector embeddings needed - uses direct LLM comparison.
"""

import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from app.services.resume_parser_llm import get_resume_parser_llm
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class ResumeMatchingServiceLLM:
    """Resume matching service using LLM instead of PyTorch."""

    def __init__(self):
        self.parser = get_resume_parser_llm()
        self.client = get_supabase()

    def _ensure_user_exists(self, user_id: str) -> str:
        """
        Ensure the user exists in the users table.
        
        The auth system returns the Supabase auth user ID, but the resumes
        and job_descriptions tables have foreign keys to the users table.
        This method checks if a user row exists (by id or auth_user_id) and
        creates one if missing.
        
        Args:
            user_id: The Supabase auth user ID
            
        Returns:
            The users table ID to use for foreign keys
        """
        try:
            # First try to find user by id (exact match)
            result = self.client.table('users').select('id').eq('id', user_id).execute()
            if result.data:
                return result.data[0]['id']
            
            # Try to find user by auth_user_id
            result = self.client.table('users').select('id').eq('auth_user_id', user_id).execute()
            if result.data:
                return result.data[0]['id']
            
            # User doesn't exist - create a new record
            logger.info(f"Auto-creating user record for auth user: {user_id}")
            new_user = {
                'id': user_id,
                'email': f'user-{user_id[:8]}@placeholder.local',
                'full_name': 'Auto-created User',
                'auth_user_id': user_id
            }
            
            # Try to get email from Supabase auth
            try:
                auth_response = self.client.auth.admin.get_user_by_id(user_id)
                if auth_response and auth_response.user:
                    new_user['email'] = auth_response.user.email or new_user['email']
                    user_meta = auth_response.user.user_metadata or {}
                    new_user['full_name'] = user_meta.get('full_name', user_meta.get('name', 'Auto-created User'))
            except Exception as auth_err:
                logger.debug(f"Could not fetch auth user details: {auth_err}")
            
            self.client.table('users').insert(new_user).execute()
            logger.info(f"Created user record: {user_id}")
            return user_id
            
        except Exception as e:
            logger.error(f"Error ensuring user exists: {e}")
            # If we can't create the user, still return the ID and let the
            # original FK error surface if the insert fails
            return user_id

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
        Process job description file.

        Args:
            file_data: File content
            filename: Filename
            user_id: User ID
            title: Job title
            department: Department (optional)
            model: LLM model (optional, currently ignored)

        Returns:
            dict with job_id, title, extracted_text, required_skills
        """
        try:
            # Extract text from job description using pdfplumber (no OCR)
            job_text = self.parser._extract_text(file_data, filename)
            if not job_text or len(job_text.strip()) < 50:
                raise ValueError("Could not extract text from job description")

            logger.info(f"Extracted {len(job_text)} chars from job description")

            # Extract required skills using LLM
            from app.services.llm_orchestrator import LLMOrchestrator
            llm = LLMOrchestrator()

            prompt = f"""Extract the required skills from this job description.

Job Description:
{job_text[:3000]}

List all required skills, technologies, tools, and qualifications.
Return as JSON array of strings:
{{"skills": ["skill1", "skill2", "skill3", ...]}}

Include:
- Programming languages
- Frameworks and libraries
- Tools and platforms
- Soft skills
- Years of experience
- Education requirements

Return ONLY the JSON object."""

            result = await llm.generate_completion(prompt)

            # Parse skills
            try:
                json_text = result['response'].strip()
                if json_text.startswith('```'):
                    json_text = json_text.split('```')[1]
                    if json_text.startswith('json'):
                        json_text = json_text[4:]
                json_text = json_text.strip()

                skills_data = json.loads(json_text)
                required_skills = skills_data.get('skills', [])

            except:
                logger.warning("Failed to parse skills JSON, using empty list")
                required_skills = []

            # Ensure user exists in the users table
            db_user_id = self._ensure_user_exists(user_id)

            # Store in database
            job_id = str(uuid.uuid4())

            job_data = {
                'id': job_id,
                'title': title,
                'department': department,
                'description': job_text[:5000],  # Limit size
                'required_skills': required_skills,
                'created_by': db_user_id,
                'created_at': datetime.now().isoformat(),
                'status': 'active'
            }

            self.client.table('job_descriptions').insert(job_data).execute()

            logger.info(f"Created job description: {job_id} - {title}")

            return {
                'job_id': job_id,
                'title': title,
                'department': department,
                'extracted_text': job_text[:1000],  # Return preview
                'required_skills': required_skills[:20],  # Return first 20
                'total_skills': len(required_skills)
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
        Process resume and match with job.

        Args:
            file_data: Resume file content
            filename: Resume filename
            user_id: User ID
            job_id: Job description ID to match against
            candidate_name: Candidate name (optional)
            candidate_email: Candidate email (optional)
            model: LLM model (optional)

        Returns:
            dict with resume_id, match_score, parsed_data, match_analysis
        """
        try:
            # Get job description
            job_result = self.client.table('job_descriptions').select('*').eq('id', job_id).execute()

            if not job_result.data:
                raise ValueError(f"Job description not found: {job_id}")

            job_data = job_result.data[0]
            job_title = job_data.get('title', 'Unknown')
            job_description = job_data.get('description', '')

            # Parse resume
            resume_data = await self.parser.parse_resume(file_data, filename)

            # Extract candidate info
            parsed = resume_data.get('parsed_data', {})
            if not candidate_name:
                candidate_name = parsed.get('name', 'Unknown')
            if not candidate_email:
                candidate_email = parsed.get('email')

            # Match with job
            match_result = await self.parser.match_with_job(
                resume_data=resume_data,
                job_description=job_description,
                job_title=job_title
            )

            # Ensure user exists in the users table
            db_user_id = self._ensure_user_exists(user_id)

            # Store in database
            resume_id = str(uuid.uuid4())

            # Build skill_match for frontend (maps LLM match fields to frontend schema)
            skill_match = {
                'key_matches': match_result.get('matching_skills', []) or match_result.get('strengths', []),
                'missing_requirements': match_result.get('missing_skills', []) or match_result.get('weaknesses', []),
                'reasoning': match_result.get('reasoning', match_result.get('overall_assessment', ''))
            }

            # Build parsed_data with skills_extracted sub-object for frontend
            parsed_data_for_db = {
                'skills_extracted': {
                    'technical_skills': parsed.get('skills', []),
                    'soft_skills': [],
                    'tools': [],
                    'languages': [],
                    'certifications': []
                },
                'name': parsed.get('name'),
                'email': parsed.get('email'),
                'phone': parsed.get('phone'),
                'summary': parsed.get('summary'),
                'experience': parsed.get('experience', []),
                'education': parsed.get('education', []),
                'years_of_experience': parsed.get('years_of_experience'),
                'file_name': filename
            }

            resume_db_data = {
                'id': resume_id,
                'job_description_id': job_id,  # Correct column name
                'candidate_name': candidate_name,
                'candidate_email': candidate_email,
                'file_path': filename,  # Store filename in file_path
                'parsed_data': parsed_data_for_db,
                'match_score': match_result.get('match_score', 0),
                'skill_match': skill_match,  # Frontend reads this directly
                'raw_text': resume_data.get('raw_text', ''),  # Frontend reads this directly
                'llm_analysis': json.dumps(match_result),  # Full LLM analysis as JSON string
                'uploaded_by': db_user_id,  # Use verified user ID
                'created_at': datetime.now().isoformat()
            }

            self.client.table('resumes').insert(resume_db_data).execute()

            logger.info(f"Processed resume: {resume_id} - {candidate_name} - Score: {match_result.get('match_score', 0)}")

            # Return in format matching ResumeResponse schema
            return {
                'resume_id': resume_id,
                'candidate_name': candidate_name,
                'candidate_email': candidate_email,
                'extracted_text': resume_data.get('raw_text', ''),
                'skills': {
                    'technical_skills': parsed.get('skills', []),
                    'soft_skills': [],
                    'tools': [],
                    'languages': [],
                    'certifications': []
                },
                'match_score': match_result.get('match_score', 0),
                'match_details': match_result,
                'file_info': {
                    'filename': filename,
                    'file_size': len(file_data) if file_data else 0,
                    'file_type': filename.split('.')[-1] if '.' in filename else 'unknown'
                },
                'metadata': {
                    'processed_at': datetime.now().isoformat(),
                    'years_of_experience': parsed.get('years_of_experience'),
                    'education': parsed.get('education', []),
                    'experience': parsed.get('experience', [])
                }
            }

        except Exception as e:
            logger.error(f"Error processing resume {filename}: {e}")
            raise

    async def process_multiple_resumes(
        self,
        resumes: List[Dict[str, Any]],
        job_id: str,
        user_id: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process multiple resumes in batch.

        Args:
            resumes: List of resume dicts with file_data, filename, candidate_name, candidate_email
            job_id: Job description ID
            user_id: User ID
            model: LLM model (optional)

        Returns:
            dict with successful, failed, and top_candidates
        """
        successful = []
        failed = []

        for resume in resumes:
            file_data = resume.get('file_data')
            filename = resume.get('filename')
            candidate_name = resume.get('candidate_name')
            candidate_email = resume.get('candidate_email')

            try:
                result = await self.process_resume(
                    file_data=file_data,
                    filename=filename,
                    user_id=user_id,
                    job_id=job_id,
                    candidate_name=candidate_name,
                    candidate_email=candidate_email,
                    model=model
                )
                successful.append(result)

            except Exception as e:
                logger.error(f"Failed to process {filename}: {e}")
                failed.append({
                    'filename': filename,
                    'candidate_name': candidate_name,
                    'error': str(e)
                })

        # Sort by match score
        successful.sort(key=lambda x: x.get('match_score', 0), reverse=True)

        # Calculate summary statistics
        scores = [r.get('match_score', 0) for r in successful]
        avg_score = sum(scores) / len(scores) if scores else 0
        max_score = max(scores) if scores else 0
        min_score = min(scores) if scores else 0

        # Return in format matching BatchResumeResponse schema
        return {
            'total_processed': len(successful),
            'total_failed': len(failed),
            'results': successful,  # Changed from 'successful'
            'failed': failed,
            'top_candidates': successful[:5],  # Top 5
            'summary': {
                'average_score': round(avg_score, 2),
                'highest_score': max_score,
                'lowest_score': min_score
            }
        }

    async def get_ranked_candidates(
        self,
        job_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get all candidates for a job, ranked by match score."""
        try:
            result = self.client.table('resumes').select('*').eq(
                'job_description_id', job_id  # Correct column name
            ).order('match_score', desc=True).limit(limit).offset(offset).execute()

            # Transform database rows to match CandidateInfo schema
            candidates = []
            for row in (result.data or []):
                # Parse llm_analysis JSON string
                match_details = None
                if row.get('llm_analysis'):
                    try:
                        match_details = json.loads(row['llm_analysis'])
                    except:
                        match_details = {}

                # Extract skills from parsed_data (already structured for frontend)
                parsed_data = row.get('parsed_data', {})
                skills_extracted = parsed_data.get('skills_extracted', {
                    'technical_skills': parsed_data.get('skills', []),
                    'soft_skills': [],
                    'tools': [],
                    'languages': [],
                    'certifications': []
                })

                candidates.append({
                    'id': row['id'],
                    'candidate_name': row.get('candidate_name') or 'Unknown',  # Handle None
                    'candidate_email': row.get('candidate_email'),
                    'match_score': float(row.get('match_score', 0)) if row.get('match_score') else None,
                    'match_details': match_details,
                    'skills_extracted': skills_extracted,
                    'created_at': row.get('created_at')
                })

            return candidates

        except Exception as e:
            logger.error(f"Error getting ranked candidates: {e}")
            raise

    async def get_job_statistics(self, job_id: str) -> Dict[str, Any]:
        """Get statistics for a job posting."""
        try:
            # Get all resumes for this job
            resumes_result = self.client.table('resumes').select('*').eq(
                'job_description_id', job_id  # Correct column name
            ).execute()

            resumes = resumes_result.data or []
            total_resumes = len(resumes)

            if total_resumes == 0:
                return {
                    'total_resumes': 0,
                    'average_score': 0,
                    'top_score': 0,
                    'lowest_score': 0,
                    'score_distribution': {
                        'strong': 0,
                        'good': 0,
                        'weak': 0
                    }
                }

            # Calculate statistics
            scores = [r.get('match_score', 0) for r in resumes]
            average_score = sum(scores) / len(scores) if scores else 0
            top_score = max(scores) if scores else 0
            bottom_score = min(scores) if scores else 0

            # Count match categories
            strong_matches = len([s for s in scores if s >= 80])
            good_matches = len([s for s in scores if 60 <= s < 80])
            weak_matches = len([s for s in scores if s < 60])

            # Return in format matching JobStatistics schema
            return {
                'total_resumes': total_resumes,
                'average_score': round(average_score, 2),  # Changed from average_match_score
                'top_score': top_score,
                'lowest_score': bottom_score,  # Changed from bottom_score
                'score_distribution': {  # Group match categories into score_distribution
                    'strong': strong_matches,  # >= 80
                    'good': good_matches,      # 60-79
                    'weak': weak_matches       # < 60
                }
            }

        except Exception as e:
            logger.error(f"Error getting job statistics: {e}")
            raise

    async def delete_resumes(self, resume_ids: List[str], user_id: str) -> Dict[str, Any]:
        """Delete multiple resumes."""
        try:
            deleted_count = 0
            failed_ids = []

            for resume_id in resume_ids:
                try:
                    # Delete the resume directly (user is already authenticated at API layer)
                    result = self.client.table('resumes').delete().eq(
                        'id', resume_id
                    ).execute()

                    if result.data and len(result.data) > 0:
                        deleted_count += 1
                        logger.info(f"Successfully deleted resume {resume_id}")
                    else:
                        logger.warning(f"Resume {resume_id} not found or already deleted")
                        failed_ids.append(resume_id)

                except Exception as e:
                    logger.error(f"Error deleting resume {resume_id}: {e}")
                    failed_ids.append(resume_id)

            logger.info(f"Delete operation complete: {deleted_count}/{len(resume_ids)} deleted")

            return {
                'deleted_count': deleted_count,
                'requested_count': len(resume_ids),
                'failed_ids': failed_ids
            }

        except Exception as e:
            logger.error(f"Error deleting resumes: {e}")
            raise


# Singleton instance
_resume_matching_service_llm = None


def get_resume_matching_service_llm() -> ResumeMatchingServiceLLM:
    """Get singleton instance of ResumeMatchingServiceLLM."""
    global _resume_matching_service_llm
    if _resume_matching_service_llm is None:
        _resume_matching_service_llm = ResumeMatchingServiceLLM()
    return _resume_matching_service_llm
