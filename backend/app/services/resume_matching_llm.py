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
from app.services.user_service import get_user_service

logger = logging.getLogger(__name__)


# ── Deterministic skill matching helpers ───────────────────────────────────

def _normalize_skill(skill: str) -> str:
    """Normalize a skill string for comparison."""
    return skill.strip().lower().replace('-', '').replace('.', '').replace(' ', '')


def _skills_match(candidate_skill: str, required_skill: str) -> bool:
    """Check if a candidate skill matches a required skill (fuzzy)."""
    c = _normalize_skill(candidate_skill)
    r = _normalize_skill(required_skill)
    if not c or not r:
        return False
    # Exact
    if c == r:
        return True
    # Substring (e.g. "react" matches "reactjs")
    if c in r or r in c:
        return True
    # Common aliases
    aliases = {
        'js': 'javascript', 'ts': 'typescript', 'py': 'python',
        'nodejs': 'node', 'reactjs': 'react', 'vuejs': 'vue',
        'nextjs': 'next', 'expressjs': 'express', 'angularjs': 'angular',
        'postgres': 'postgresql', 'mongo': 'mongodb', 'mssql': 'sqlserver',
        'csharp': 'c#', 'cplusplus': 'c++', 'golang': 'go',
        'k8s': 'kubernetes', 'tf': 'terraform',
        'ml': 'machinelearning', 'ai': 'artificialintelligence',
        'dl': 'deeplearning', 'nlp': 'naturallanguageprocessing',
        'aws': 'amazonwebservices', 'gcp': 'googlecloudplatform',
        'dotnet': 'net', 'aspnet': 'aspnetcore',
    }
    c_resolved = aliases.get(c, c)
    r_resolved = aliases.get(r, r)
    if c_resolved == r_resolved:
        return True
    if c_resolved in r_resolved or r_resolved in c_resolved:
        return True
    return False


def compute_algorithmic_score(
    candidate_skills: List[str],
    required_skills: List[str],
    years_of_experience: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute a deterministic match score from skill overlap + experience.

    Scoring:
      - Skill overlap ratio (0-100), weighted 90%
      - Experience bonus: up to +10 points for 5+ years

    Returns dict with score (0-100), matched skills, missing skills.
    """
    if not required_skills:
        return {'score': None, 'matched': [], 'missing': []}

    matched = []
    missing = []

    for req in required_skills:
        found = any(_skills_match(cand, req) for cand in candidate_skills)
        (matched if found else missing).append(req)

    skill_ratio = len(matched) / len(required_skills)
    skill_score = round(skill_ratio * 100)

    exp_bonus = 0
    if years_of_experience is not None:
        exp_bonus = min(int(years_of_experience) * 2, 10)

    return {
        'score': min(skill_score + exp_bonus, 100),
        'matched': matched,
        'missing': missing,
        'skill_ratio': round(skill_ratio, 2),
    }


class ResumeMatchingServiceLLM:
    """Resume matching service using LLM instead of PyTorch."""

    def __init__(self):
        self.parser = get_resume_parser_llm()
        self.client = get_supabase()
        self.user_service = get_user_service()

    def _ensure_user_exists(self, user_id: str) -> str:
        """
        Ensure the user exists in the users table.
        """
        return self.user_service.resolve_user_id(user_id)

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

            # Dedup: return existing record if same title + filename uploaded by same user recently
            existing = self.client.table('job_descriptions') \
                .select('id') \
                .eq('title', title) \
                .eq('file_path', filename) \
                .eq('created_by', db_user_id) \
                .limit(1) \
                .execute()
            if existing.data:
                existing_id = existing.data[0]['id']
                logger.info(f"Returning existing job description {existing_id} for title='{title}' file='{filename}'")
                return {
                    'job_id': existing_id,
                    'title': title,
                    'department': department,
                    'extracted_text': job_text[:1000],
                    'required_skills': required_skills[:20],
                    'total_skills': len(required_skills)
                }

            # Store in database
            job_id = str(uuid.uuid4())

            job_data = {
                'id': job_id,
                'title': title,
                'department': department,
                'raw_text': job_text[:5000],
                'file_path': filename,
                'parsed_data': {
                    'required_skills': required_skills,
                    'file_name': filename,
                },
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
            job_title = job_data.get('title', 'Unknown') or 'Unknown'
            job_description = job_data.get('description') or job_data.get('raw_text') or ''

            # Parse resume
            resume_data = await self.parser.parse_resume(file_data, filename)

            # Extract candidate info
            parsed = resume_data.get('parsed_data', {})
            if not candidate_name:
                candidate_name = parsed.get('name', 'Unknown')
            if not candidate_email:
                candidate_email = parsed.get('email')

            # Match with job (LLM qualitative analysis)
            match_result = await self.parser.match_with_job(
                resume_data=resume_data,
                job_description=job_description,
                job_title=job_title
            )

            # ── Hybrid scoring: algorithmic (60%) + LLM (40%) ──────────────
            # Algorithmic score from skill overlap (deterministic)
            job_required_skills = (job_data.get('parsed_data') or {}).get('required_skills', [])
            candidate_skills = parsed.get('skills', [])
            algo = compute_algorithmic_score(
                candidate_skills=candidate_skills,
                required_skills=job_required_skills,
                years_of_experience=parsed.get('years_of_experience'),
            )

            llm_score = match_result.get('match_score', 0)
            if algo['score'] is not None:
                # Blend: 60% algorithmic + 40% LLM
                match_score = round(algo['score'] * 0.6 + llm_score * 0.4)
            else:
                # No required_skills extracted — fall back to LLM score only
                match_score = llm_score

            logger.info(
                f"Hybrid score for {candidate_name}: algo={algo['score']} llm={llm_score} final={match_score} "
                f"(matched {len(algo['matched'])}/{len(job_required_skills)} skills)"
            )

            # Ensure user exists in the users table
            db_user_id = self._ensure_user_exists(user_id)

            # Store in database
            resume_id = str(uuid.uuid4())

            # Derive recommendation deterministically from final score
            if match_score >= 80:
                deterministic_recommendation = 'Strong recommend'
            elif match_score >= 65:
                deterministic_recommendation = 'Recommend'
            elif match_score >= 50:
                deterministic_recommendation = 'Consider'
            else:
                deterministic_recommendation = 'Not recommended'

            # Use algorithmic matched/missing skills when available, fall back to LLM
            algo_matched = algo['matched'] if algo['score'] is not None else []
            algo_missing = algo['missing'] if algo['score'] is not None else []

            # Build skill_match for frontend (maps LLM match fields to frontend schema)
            skill_match = {
                'key_matches': algo_matched or match_result.get('matching_skills', []) or match_result.get('strengths', []),
                'missing_requirements': algo_missing or match_result.get('missing_skills', []) or match_result.get('weaknesses', []),
                'reasoning': match_result.get('reasoning', match_result.get('overall_assessment', '')),
                'recommendation': deterministic_recommendation,
                'overall_assessment': match_result.get('overall_assessment', ''),
                'experience_match': match_result.get('experience_match', ''),
                'education_match': match_result.get('education_match', ''),
                'strengths': match_result.get('strengths', []),
                'weaknesses': match_result.get('weaknesses', []),
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
                'job_description_id': job_id,
                'candidate_name': candidate_name,
                'candidate_email': candidate_email,
                'candidate_phone': parsed.get('phone'),
                'file_path': filename,
                'parsed_data': parsed_data_for_db,
                'match_score': match_score,
                'skill_match': skill_match,
                'experience_match': match_result.get('experience_match', ''),
                'raw_text': resume_data.get('raw_text', ''),
                'uploaded_by': db_user_id,
                'created_at': datetime.now().isoformat()
            }

            self.client.table('resumes').insert(resume_db_data).execute()

            logger.info(f"Processed resume: {resume_id} - {candidate_name} - Score: {match_score}")

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
                'match_score': match_score,
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
                    'candidate_name': candidate_name or "Unknown",
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
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get all candidates for a job, ranked by match score."""
        try:
            db_user_id = self._ensure_user_exists(user_id)
            
            # Verify job ownership first
            job_check = self.client.table('job_descriptions').select('id').eq('id', job_id).eq('created_by', db_user_id).execute()
            if not job_check.data:
                logger.warning(f"Ownership check failed for job {job_id} by user {db_user_id}")
                return []

            result = self.client.table('resumes').select('*').eq(
                'job_description_id', job_id
            ).eq('uploaded_by', db_user_id).order('match_score', desc=True).limit(limit).offset(offset).execute()

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

                # Extract recommendation info from skill_match (stored during processing)
                skill_match = row.get('skill_match') or {}

                candidates.append({
                    'id': row['id'],
                    'candidate_name': row.get('candidate_name') or 'Unknown',  # Handle None
                    'candidate_email': row.get('candidate_email'),
                    'match_score': float(row.get('match_score', 0)) if row.get('match_score') else None,
                    'match_details': match_details,
                    'skills_extracted': skills_extracted,
                    'recommendation': skill_match.get('recommendation') or (match_details or {}).get('recommendation', ''),
                    'overall_assessment': skill_match.get('overall_assessment') or (match_details or {}).get('overall_assessment', ''),
                    'experience_match': skill_match.get('experience_match') or (match_details or {}).get('experience_match', ''),
                    'key_matches': skill_match.get('key_matches', []),
                    'missing_requirements': skill_match.get('missing_requirements', []),
                    'created_at': row.get('created_at')
                })

            return candidates

        except Exception as e:
            logger.error(f"Error getting ranked candidates: {e}")
            raise

            return {
                "total_resumes": len(resumes),
                "average_score": round(sum(scores) / len(scores), 2) if scores else 0,
                "top_score": max(scores) if scores else 0,
                "lowest_score": min(scores) if scores else 0,
                "score_distribution": score_ranges
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
                    db_user_id = self._ensure_user_exists(user_id)
                    # Delete the resume with ownership check
                    result = self.client.table('resumes').delete().eq(
                        'id', resume_id
                    ).eq('uploaded_by', db_user_id).execute()

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

    async def delete_job_description(self, job_id: str, user_id: str) -> Dict[str, Any]:
        """
        Delete a job description and all its associated resumes (cascade).

        Args:
            job_id: Job description ID
            user_id: User ID (for ownership check)

        Returns:
            dict with deleted job_id
        """
        try:
            db_user_id = self._ensure_user_exists(user_id)

            # Verify ownership — check both possible stored user IDs
            result = self.client.table('job_descriptions') \
                .select('id') \
                .eq('id', job_id) \
                .in_('created_by', [user_id, db_user_id]) \
                .limit(1) \
                .execute()

            if not result.data:
                raise ValueError(f"Job description {job_id} not found or access denied")

            # Delete — resumes are removed automatically via ON DELETE CASCADE
            self.client.table('job_descriptions').delete().eq('id', job_id).execute()

            logger.info(f"Deleted job description {job_id} and its resumes")
            return {'job_id': job_id}

        except Exception as e:
            logger.error(f"Error deleting job description {job_id}: {e}")
            raise

    async def get_job_description(self, job_id: str, user_id: str) -> Dict[str, Any]:
        """
        Get job description details by ID with ownership check.

        Args:
            job_id: Job description ID
            user_id: User ID

        Returns:
            dict with job description details including raw_text
        """
        try:
            db_user_id = self._ensure_user_exists(user_id)
            result = self.client.table("job_descriptions").select("*").eq("id", job_id).eq("created_by", db_user_id).single().execute()
            if not result.data:
                raise ValueError(f"Job description with ID {job_id} not found or access denied")
            return result.data
        except Exception as e:
            logger.error(f"Error getting job description: {e}")
            raise

    async def get_job_statistics(self, job_id: str, user_id: str) -> Dict[str, Any]:
        """
        Get statistics for a job posting.

        Args:
            job_id: Job description ID
            user_id: User ID (for authentication)

        Returns:
            dict with statistics
        """
        try:
            # Get all resumes for this job
            resumes = await self.get_ranked_candidates(job_id, user_id, limit=1000)

            if not resumes:
                return {
                    "total_resumes": 0,
                    "average_score": 0,
                    "top_score": 0,
                    "lowest_score": 0,
                    "score_distribution": {}
                }

            scores = [r.get("match_score", 0) for r in resumes]

            # Calculate score distribution
            score_ranges = {
                "90-100": 0,
                "80-89": 0,
                "70-79": 0,
                "60-69": 0,
                "0-59": 0,
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
                    score_ranges["0-59"] += 1

            return {
                "total_resumes": len(resumes),
                "average_score": round(sum(scores) / len(scores), 2) if scores else 0,
                "top_score": max(scores) if scores else 0,
                "lowest_score": min(scores) if scores else 0,
                "score_distribution": score_ranges
            }

        except Exception as e:
            logger.error(f"Error getting job statistics: {e}")
            raise


# Singleton instance
_resume_matching_service_llm = None


def get_resume_matching_service_llm() -> ResumeMatchingServiceLLM:
    """Get singleton instance of ResumeMatchingServiceLLM."""
    global _resume_matching_service_llm
    if _resume_matching_service_llm is None:
        _resume_matching_service_llm = ResumeMatchingServiceLLM()
    return _resume_matching_service_llm
