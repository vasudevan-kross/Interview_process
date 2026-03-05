"""
Coding Interviews API endpoints.

Provides REST API for:
- Creating and managing interviews
- AI question generation
- Candidate submission tracking
- Code auto-save and evaluation
- Anti-cheating monitoring
"""

import logging
import json
from fastapi import APIRouter, HTTPException, status, Request, Body, Depends, UploadFile, File, Form
from typing import List, Optional

from app.schemas.coding_interviews import (
    InterviewCreate,
    GenerateQuestionsRequest,
    StartSubmissionRequest,
    SaveCodeRequest,
    SubmitInterviewRequest,
    TrackActivityRequest
)
from app.services.coding_interview_service import get_coding_interview_service
from app.services.question_generator import get_question_generator
from app.services.document_processor import get_document_processor
from app.services.llm_orchestrator import get_llm_orchestrator
from app.db.supabase_client import get_supabase
from app.auth.dependencies import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coding-interviews", tags=["coding-interviews"])


@router.post("", summary="Create coding interview")
async def create_interview(
    request: InterviewCreate,
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Create a new coding or testing interview with questions.

    Returns:
        - interview_id
        - access_token (for shareable link)
        - shareable_link
        - questions
    """
    try:
        service = get_coding_interview_service()

        # Convert questions to dict
        questions_data = [q.dict() for q in request.questions]

        result = await service.create_interview(
            title=request.title,
            description=request.description or "",
            scheduled_start_time=request.scheduled_start_time,
            scheduled_end_time=request.scheduled_end_time,
            programming_language=request.programming_language,
            interview_type=request.interview_type,
            questions_data=questions_data,
            user_id=current_user_id,
            grace_period_minutes=request.grace_period_minutes,
            resume_required=request.resume_required,
            allowed_languages=request.allowed_languages,
            bond_terms=request.bond_terms,
            bond_document_url=request.bond_document_url,
            require_signature=request.require_signature,
            bond_years=request.bond_years
        )

        return result

    except Exception as e:
        logger.error(f"Error creating interview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create interview: {str(e)}"
        )


@router.post("/generate-questions", summary="Generate questions with AI")
async def generate_questions(request: GenerateQuestionsRequest):
    """
    Generate interview questions using AI (Ollama codellama:7b).

    Supports:
    - Coding questions (algorithms, development)
    - Testing questions (test cases, automation code)
    - Auto-detects testing roles from job description
    """
    try:
        generator = get_question_generator()

        # Auto-detect if the job description is for a testing/QA role
        testing_keywords = [
            'tester', 'testing', 'qa ', 'quality assurance', 'sdet',
            'test engineer', 'test analyst', 'automation tester',
            'manual tester', 'test lead', 'test case', 'test plan',
            'selenium', 'playwright', 'cypress', 'appium', 'jmeter',
            'bug', 'defect', 'regression', 'smoke test', 'sanity test',
        ]
        jd_lower = request.job_description.lower()
        is_testing_role = any(kw in jd_lower for kw in testing_keywords)

        # Determine effective interview type
        effective_type = request.interview_type
        if is_testing_role and effective_type == 'coding':
            effective_type = 'testing'
            logger.info(f"Auto-detected testing role from job description, switching to testing questions")

        if effective_type == 'testing' or request.test_framework:
            # Generate testing questions
            questions = await generator.generate_testing_questions(
                job_description=request.job_description,
                difficulty=request.difficulty,
                num_questions=request.num_questions,
                test_framework=request.test_framework or 'manual-test-cases'
            )
        elif effective_type == 'both':
            # Generate a mix: half coding, half testing
            coding_count = request.num_questions // 2
            testing_count = request.num_questions - coding_count
            coding_qs = await generator.generate_coding_questions(
                job_description=request.job_description,
                difficulty=request.difficulty,
                num_questions=coding_count,
                programming_language=request.programming_language or 'python'
            )
            testing_qs = await generator.generate_testing_questions(
                job_description=request.job_description,
                difficulty=request.difficulty,
                num_questions=testing_count,
                test_framework=request.test_framework or 'manual-test-cases'
            )
            questions = coding_qs + testing_qs
        else:
            # Generate coding questions
            questions = await generator.generate_coding_questions(
                job_description=request.job_description,
                difficulty=request.difficulty,
                num_questions=request.num_questions,
                programming_language=request.programming_language or 'python'
            )

        return {
            'questions': questions,
            'count': len(questions),
            'detected_type': effective_type,
        }

    except Exception as e:
        logger.error(f"Error generating questions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate questions: {str(e)}"
        )


@router.post("/extract-questions", summary="Extract questions from document")
async def extract_questions_from_document(
    file: UploadFile = File(...),
    programming_language: str = Form('python'),
    interview_type: str = Form('coding'),
    difficulty: str = Form('medium')
):
    """
    Extract interview questions from uploaded document.

    Supports: PDF, Word (DOCX), Images (JPG, PNG), Excel (XLSX), CSV

    Process:
    1. Extract text using OCR/document processing
    2. Parse questions using LLM
    3. Return structured questions for review
    """
    try:
        # Validate file type
        allowed_extensions = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'xlsx', 'csv']
        file_ext = file.filename.split('.')[-1].lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {file_ext}. Allowed: {', '.join(allowed_extensions)}"
            )

        logger.info(f"Extracting questions from {file.filename} ({file_ext})")

        # Read file content
        content = await file.read()

        # Extract text from document
        doc_processor = get_document_processor()
        extraction_result = await doc_processor.extract_text(
            file_data=content,
            filename=file.filename,
            file_type=file_ext
        )

        extracted_text = extraction_result.get('extracted_text', '')

        if not extracted_text or len(extracted_text.strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract text from document. Please ensure document is readable."
            )

        logger.info(f"Extracted {len(extracted_text)} characters from document ({extraction_result.get('page_count', 0)} pages)")

        # Parse questions using LLM
        llm = get_llm_orchestrator()

        system_prompt = """You are an expert at extracting interview questions from documents and structuring them as JSON.
Always return valid JSON arrays only, without any additional text or explanation."""

        prompt = f"""Extract coding interview questions from the following document text and return them as a JSON array.

Document Text:
{extracted_text[:4000]}

Return ONLY a JSON array with this exact structure (no markdown, no explanations):
[
  {{
    "question_text": "Full question text here",
    "difficulty": "{difficulty}",
    "marks": 10,
    "topics": ["relevant", "topics"],
    "starter_code": "",
    "solution_code": ""
  }}
]

Rules:
- Extract ALL questions from the document
- If marks not specified, use: easy=5-10, medium=10-20, hard=20-30
- Keep exact question wording from document
- Return valid JSON array only"""

        result = await llm.generate_completion(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.3  # Low temperature for more consistent JSON output
        )

        # Parse LLM response as JSON
        try:
            # Extract JSON from response (handle markdown code blocks and various formats)
            json_text = result['response'].strip()

            # Remove markdown code blocks
            if '```json' in json_text:
                json_text = json_text.split('```json')[1].split('```')[0].strip()
            elif '```' in json_text:
                json_text = json_text.split('```')[1].split('```')[0].strip()

            # Try to find JSON array in the response
            if '[' in json_text:
                start = json_text.index('[')
                end = json_text.rindex(']') + 1
                json_text = json_text[start:end]

            json_text = json_text.strip()

            if not json_text:
                raise ValueError("Empty response from LLM")

            questions = json.loads(json_text)

            if not isinstance(questions, list):
                raise ValueError("Expected array of questions")

            logger.info(f"Successfully extracted {len(questions)} questions")

            return {
                'questions': questions,
                'count': len(questions),
                'extracted_text_length': len(extracted_text)
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"LLM Response: {result.get('response', '')[:500]}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to parse questions from document. LLM response was not valid JSON. Please try again or check the document format."
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting questions from document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract questions: {str(e)}"
        )


@router.get("", summary="List interviews")
async def list_interviews(
    current_user_id: str = Depends(get_current_user_id),
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List all interviews created by the current user."""
    try:
        client = get_supabase()
        from datetime import datetime, timezone

        # Auto-update expired interviews before listing
        # Find interviews that are still 'scheduled' or 'in_progress' but past their end time
        active_result = client.table('coding_interviews').select(
            'id, status, scheduled_end_time, grace_period_minutes'
        ).eq('created_by', current_user_id).in_(
            'status', ['scheduled', 'in_progress']
        ).execute()

        now = datetime.now(timezone.utc)
        if active_result.data:
            for interview in active_result.data:
                end_time_str = interview.get('scheduled_end_time')
                if not end_time_str:
                    continue

                # Parse end time
                try:
                    end_time = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                    # Ensure timezone-aware (treat naive as UTC)
                    if end_time.tzinfo is None:
                        end_time = end_time.replace(tzinfo=timezone.utc)
                except (ValueError, AttributeError):
                    continue

                grace_minutes = interview.get('grace_period_minutes', 0) or 0
                from datetime import timedelta
                effective_end = end_time + timedelta(minutes=grace_minutes)

                if now > effective_end:
                    # Time has expired — update status
                    new_status = 'expired' if interview['status'] == 'scheduled' else 'completed'
                    try:
                        client.table('coding_interviews').update({
                            'status': new_status
                        }).eq('id', interview['id']).execute()
                        logger.info(f"Auto-updated interview {interview['id']} to {new_status}")
                    except Exception as update_err:
                        logger.warning(f"Failed to auto-update interview status: {update_err}")

        # Now fetch the list with updated statuses
        query = client.table('coding_interviews').select('*').eq('created_by', current_user_id).order('created_at', desc=True).limit(limit).offset(offset)

        if status_filter:
            query = query.eq('status', status_filter)

        result = query.execute()

        # Calculate duration_minutes dynamically for each interview
        interviews = result.data or []
        for interview in interviews:
            try:
                start_time = datetime.fromisoformat(interview['scheduled_start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(interview['scheduled_end_time'].replace('Z', '+00:00'))
                interview['duration_minutes'] = int((end_time - start_time).total_seconds() / 60)
            except (ValueError, KeyError, TypeError):
                interview['duration_minutes'] = None

        return {
            'interviews': interviews,
            'count': len(interviews)
        }

    except Exception as e:
        logger.error(f"Error listing interviews: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list interviews: {str(e)}"
        )


@router.get("/{interview_id}", summary="Get interview details")
async def get_interview(
    interview_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Get interview details with questions."""
    try:
        client = get_supabase()

        # Get interview and verify ownership
        interview_result = client.table('coding_interviews').select('*').eq(
            'id', interview_id
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data or len(interview_result.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        interview = interview_result.data[0]

        # Auto-update status if end time has passed
        from datetime import datetime, timezone, timedelta
        if interview.get('status') in ('scheduled', 'in_progress'):
            end_time_str = interview.get('scheduled_end_time')
            if end_time_str:
                try:
                    end_time = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                    # Ensure timezone-aware (treat naive as UTC)
                    if end_time.tzinfo is None:
                        end_time = end_time.replace(tzinfo=timezone.utc)
                    grace_minutes = interview.get('grace_period_minutes', 0) or 0
                    effective_end = end_time + timedelta(minutes=grace_minutes)
                    now = datetime.now(timezone.utc)

                    if now > effective_end:
                        new_status = 'expired' if interview['status'] == 'scheduled' else 'completed'
                        client.table('coding_interviews').update({
                            'status': new_status
                        }).eq('id', interview_id).execute()
                        interview['status'] = new_status
                        logger.info(f"Auto-updated interview {interview_id} to {new_status}")
                except (ValueError, AttributeError):
                    pass

        # Get questions
        questions_result = client.table('coding_questions').select('*').eq(
            'interview_id', interview_id
        ).order('question_number').execute()

        interview['questions'] = questions_result.data or []

        # Calculate duration_minutes dynamically from scheduled times
        try:
            start_time = datetime.fromisoformat(interview['scheduled_start_time'].replace('Z', '+00:00'))
            end_time = datetime.fromisoformat(interview['scheduled_end_time'].replace('Z', '+00:00'))
            interview['duration_minutes'] = int((end_time - start_time).total_seconds() / 60)
        except (ValueError, KeyError, TypeError):
            interview['duration_minutes'] = None

        return interview

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting interview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get interview: {str(e)}"
        )


@router.delete("/{interview_id}", summary="Delete interview")
async def delete_interview(
    interview_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Delete an interview (cascade deletes questions, submissions)."""
    try:
        client = get_supabase()

        # Delete and verify ownership (CASCADE will handle related records)
        result = client.table('coding_interviews').delete().eq(
            'id', interview_id
        ).eq('created_by', current_user_id).execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        return {'message': 'Interview deleted successfully'}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting interview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete interview: {str(e)}"
        )


@router.get("/submissions/{submission_id}/risk-score", summary="Get submission risk score")
async def get_submission_risk_score(
    submission_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Get comprehensive risk score for a submission based on anti-cheating activities.

    Returns:
    - total_risk_score: Sum of all risk points
    - risk_level: low/medium/high/critical
    - activity_counts: Count of each activity type
    - high_risk_activities: List of concerning activities
    - flagged_events: Specific flagged events
    """
    try:
        service = get_coding_interview_service()
        client = get_supabase()

        # Verify ownership
        submission_result = client.table('coding_submissions').select(
            'id, interview_id'
        ).eq('id', submission_id).execute()

        if not submission_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )

        submission = submission_result.data[0]

        # Check if user owns the interview
        interview_result = client.table('coding_interviews').select('id').eq(
            'id', submission['interview_id']
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this submission"
            )

        # Calculate risk score
        risk_score = await service.get_submission_risk_score(submission_id)

        return risk_score

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting risk score: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get risk score: {str(e)}"
        )


@router.get("/join/{access_token}", summary="Join interview (public)")
async def join_interview(access_token: str):
    """
    Public endpoint for candidates to join interview.
    Validates token and returns interview details (without solutions).
    """
    try:
        service = get_coding_interview_service()

        interview = await service.get_interview_by_token(access_token)

        return interview

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error joining interview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to join interview"
        )


@router.post("/start", summary="Start submission (public)")
async def start_submission(
    request: StartSubmissionRequest,
    interview_id: str,
    http_request: Request
):
    """
    Public endpoint for candidates to start interview.
    Creates submission record and validates time window.
    """
    try:
        service = get_coding_interview_service()

        # Get IP and user agent
        ip_address = http_request.client.host
        user_agent = http_request.headers.get('user-agent', '')

        result = await service.start_submission(
            interview_id=interview_id,
            candidate_name=request.candidate_name,
            candidate_email=request.candidate_email,
            candidate_phone=request.candidate_phone,
            ip_address=ip_address,
            user_agent=user_agent,
            preferred_language=request.preferred_language
        )

        return result

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error starting submission: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start submission"
        )


@router.post("/save-code", summary="Auto-save code (public)")
async def save_code(request: SaveCodeRequest):
    """
    Public endpoint for auto-saving code.
    Called every 30 seconds from frontend.
    """
    try:
        service = get_coding_interview_service()

        result = await service.save_code(
            submission_id=request.submission_id,
            question_id=request.question_id,
            code=request.code,
            programming_language=request.programming_language
        )

        return result

    except Exception as e:
        logger.error(f"Error saving code: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save code: {type(e).__name__}: {str(e)}"
        )


@router.post("/submit", summary="Submit interview (public)")
async def submit_interview(request: SubmitInterviewRequest, req: Request):
    """
    Public endpoint for submitting interview.
    Finalizes submission and triggers evaluation.
    Accepts optional signature data and terms acceptance.
    """
    try:
        service = get_coding_interview_service()

        # Get IP address for audit trail
        client_ip = req.client.host if req.client else None

        result = await service.submit_interview(
            submission_id=request.submission_id,
            auto_submit=False,
            signature_data=request.signature_data,
            terms_accepted=request.terms_accepted,
            client_ip=client_ip
        )

        return result

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error submitting interview: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit interview: {type(e).__name__}: {str(e)}"
        )


@router.post("/activity", summary="Track activity (public)")
async def track_activity(request: TrackActivityRequest):
    """
    Public endpoint for tracking anti-cheating events.
    Logs tab switches, copy/paste, etc.
    """
    try:
        service = get_coding_interview_service()

        await service.track_activity(
            submission_id=request.submission_id,
            activity_type=request.activity_type,
            question_id=request.question_id,
            metadata=request.metadata
        )

        return {'status': 'logged'}

    except Exception as e:
        logger.error(f"Error tracking activity: {e}")
        # Don't fail the request if activity tracking fails
        return {'status': 'failed', 'error': str(e)}


@router.post("/upload-resume", summary="Upload resume (public)")
async def upload_resume(
    submission_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Public endpoint for candidates to upload their resume.
    Stores file in Supabase Storage and updates submission record.
    """
    try:
        # Validate file type
        allowed_extensions = ['pdf', 'docx', 'doc']
        file_ext = file.filename.split('.')[-1].lower() if file.filename else ''

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {file_ext}. Allowed: {', '.join(allowed_extensions)}"
            )

        # Read file content
        content = await file.read()

        if len(content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 10MB."
            )

        client = get_supabase()

        # Verify submission exists
        submission_result = client.table('coding_submissions').select('id, interview_id').eq(
            'id', submission_id
        ).execute()

        if not submission_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )

        # Upload to Supabase Storage
        import uuid
        storage_path = f"coding-resumes/{submission_id}/{uuid.uuid4()}.{file_ext}"

        try:
            client.storage.from_('documents').upload(
                storage_path,
                content,
                file_options={"content-type": file.content_type or "application/octet-stream"}
            )
        except Exception as storage_err:
            # If bucket doesn't exist, try creating it
            logger.warning(f"Storage upload failed, trying to create bucket: {storage_err}")
            try:
                client.storage.create_bucket('documents', options={"public": False})
                client.storage.from_('documents').upload(
                    storage_path,
                    content,
                    file_options={"content-type": file.content_type or "application/octet-stream"}
                )
            except Exception as retry_err:
                logger.error(f"Storage upload retry failed: {retry_err}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to upload resume to storage"
                )

        # Update submission with resume path
        from datetime import datetime
        client.table('coding_submissions').update({
            'resume_path': storage_path,
            'resume_uploaded_at': datetime.now().isoformat()
        }).eq('id', submission_id).execute()

        logger.info(f"Resume uploaded for submission {submission_id}: {storage_path}")

        return {
            'status': 'uploaded',
            'resume_path': storage_path,
            'filename': file.filename
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading resume: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload resume: {str(e)}"
        )


@router.get("/submissions/{submission_id}/resume", summary="Download resume")
async def get_submission_resume(
    submission_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Get a signed URL for viewing the candidate's uploaded resume."""
    try:
        client = get_supabase()

        # Get submission
        submission_result = client.table('coding_submissions').select(
            'resume_path, interview_id'
        ).eq('id', submission_id).execute()

        if not submission_result.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        submission = submission_result.data[0]

        # Verify interview ownership
        interview_result = client.table('coding_interviews').select('id').eq(
            'id', submission['interview_id']
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data:
            raise HTTPException(status_code=403, detail="Not authorized")

        resume_path = submission.get('resume_path')
        if not resume_path:
            raise HTTPException(status_code=404, detail="No resume uploaded for this submission")

        # Generate signed URL (valid for 1 hour)
        signed_url = client.storage.from_('documents').create_signed_url(
            resume_path, 3600
        )

        return {
            'resume_url': signed_url.get('signedURL') or signed_url.get('signedUrl', ''),
            'resume_path': resume_path
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting resume: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get resume: {str(e)}"
        )


@router.get("/{interview_id}/submissions", summary="List submissions")
async def list_submissions(
    interview_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """List all submissions for an interview."""
    try:
        client = get_supabase()

        # Verify interview ownership
        interview_result = client.table('coding_interviews').select('id').eq(
            'id', interview_id
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        # Get submissions
        submissions_result = client.table('coding_submissions').select('*').eq(
            'interview_id', interview_id
        ).order('submitted_at', desc=True).execute()

        return {
            'submissions': submissions_result.data or [],
            'count': len(submissions_result.data) if submissions_result.data else 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing submissions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list submissions"
        )


@router.get("/submissions/{submission_id}", summary="Get submission details")
async def get_submission(
    submission_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Get detailed submission with all answers and evaluations."""
    try:
        client = get_supabase()

        # Get submission
        submission_result = client.table('coding_submissions').select('*').eq(
            'id', submission_id
        ).execute()

        if not submission_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )

        submission = submission_result.data[0]

        # Verify interview ownership
        interview_result = client.table('coding_interviews').select('id').eq(
            'id', submission['interview_id']
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this submission"
            )

        # Get answers with evaluations
        answers_result = client.table('coding_answers').select('*').eq(
            'submission_id', submission_id
        ).execute()

        answers = answers_result.data or []

        # Fetch questions to attach question_text to each answer
        questions_result = client.table('coding_questions').select(
            'id, question_text, difficulty, marks, topics'
        ).eq('interview_id', submission['interview_id']).execute()

        questions_map = {}
        if questions_result.data:
            for q in questions_result.data:
                questions_map[q['id']] = q

        # Attach question details to each answer
        for answer in answers:
            q_data = questions_map.get(answer.get('question_id'), {})
            answer['question_text'] = q_data.get('question_text', '')
            answer['question_marks'] = q_data.get('marks', 0)
            answer['question_difficulty'] = q_data.get('difficulty', 'medium')
            answer['question_topics'] = q_data.get('topics', [])

        submission['answers'] = answers

        # Get activity log
        activities_result = client.table('session_activities').select('*').eq(
            'submission_id', submission_id
        ).order('timestamp').execute()

        submission['activities'] = activities_result.data or []

        return submission

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting submission: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get submission"
        )


@router.post("/submissions/{submission_id}/evaluate", summary="Re-evaluate submission")
async def reevaluate_submission(
    submission_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Manually trigger re-evaluation of a submission."""
    try:
        service = get_coding_interview_service()

        # Verify ownership (similar to get_submission)
        client = get_supabase()
        submission_result = client.table('coding_submissions').select('interview_id').eq(
            'id', submission_id
        ).execute()

        if not submission_result.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        interview_result = client.table('coding_interviews').select('id').eq(
            'id', submission_result.data[0]['interview_id']
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Re-evaluate
        result = await service.evaluate_submission(submission_id)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error re-evaluating submission: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to re-evaluate submission"
        )


@router.post("/{interview_id}/evaluate-all", summary="Bulk evaluate all submissions")
async def evaluate_all_submissions(
    interview_id: str,
    current_user_id: str = Depends(get_current_user_id)
):
    """Evaluate all submitted submissions for an interview in bulk."""
    try:
        service = get_coding_interview_service()
        client = get_supabase()

        # Verify ownership
        interview_result = client.table('coding_interviews').select('id').eq(
            'id', interview_id
        ).eq('created_by', current_user_id).execute()

        if not interview_result.data:
            raise HTTPException(status_code=403, detail="Not authorized to access this interview")

        # Get all submitted submissions for this interview
        submissions_result = client.table('coding_submissions').select('id, status').eq(
            'interview_id', interview_id
        ).in_('status', ['submitted', 'auto_submitted']).execute()

        if not submissions_result.data:
            return {
                "message": "No submissions to evaluate",
                "total": 0,
                "evaluated": 0,
                "failed": 0,
                "results": []
            }

        total = len(submissions_result.data)
        evaluated = 0
        failed = 0
        results = []

        logger.info(f"Starting bulk evaluation for {total} submissions in interview {interview_id}")

        # Evaluate each submission
        for submission in submissions_result.data:
            submission_id = submission['id']
            try:
                result = await service.evaluate_submission(submission_id)
                evaluated += 1
                results.append({
                    "submission_id": submission_id,
                    "status": "success",
                    "total_marks": result.get('total_marks_awarded'),
                    "percentage": result.get('percentage')
                })
                logger.info(f"✅ Evaluated submission {submission_id}: {result.get('percentage')}%")
            except Exception as e:
                failed += 1
                results.append({
                    "submission_id": submission_id,
                    "status": "failed",
                    "error": str(e)
                })
                logger.error(f"❌ Failed to evaluate submission {submission_id}: {e}")

        logger.info(f"Bulk evaluation completed: {evaluated} successful, {failed} failed out of {total}")

        return {
            "message": f"Evaluated {evaluated} out of {total} submissions",
            "total": total,
            "evaluated": evaluated,
            "failed": failed,
            "results": results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk evaluation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to perform bulk evaluation"
        )
