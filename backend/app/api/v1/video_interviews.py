"""
Video Interview API endpoints.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional
from datetime import datetime
import logging

from app.schemas.video_interviews import (
    ScheduleInterviewRequest,
    ScheduleInterviewResponse,
    UpdateInterviewRequest,
    AddParticipantRequest,
    CreateEvaluationRequest,
    InterviewResponse,
    InterviewListResponse,
    InterviewDetailsResponse,
    ParticipantResponse,
    QuestionResponse,
    SessionStartedWebhook,
    SessionEndedWebhook,
    RecordingReadyWebhook
)
from app.services.video_interview_service import get_video_interview_service
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video-interviews", tags=["Video Interviews"])


from app.auth.dependencies import get_current_user_id
from app.services.user_service import get_user_service


@router.post(
    "/schedule",
    response_model=ScheduleInterviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a new video interview"
)
async def schedule_interview(
    request: ScheduleInterviewRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Schedule a new video interview.

    Creates a 100ms room, generates join tokens for all participants,
    and stores interview details in the database.

    - **job_id**: Job description ID
    - **candidate_email**: Candidate's email address
    - **candidate_name**: Candidate's full name
    - **scheduled_at**: Interview datetime (ISO 8601 format)
    - **duration_minutes**: Expected duration (15-480 minutes)
    - **interviewers**: List of interviewers with name and email
    - **questions**: Optional pre-loaded interview questions
    """
    try:
        # Resolve raw user ID to internal UUID
        user_service = get_user_service()
        current_internal_id = user_service.resolve_user_id(user_id)
        
        service = get_video_interview_service()

        result = await service.schedule_interview(
            job_id=request.job_id,
            candidate_email=request.candidate_email,
            candidate_name=request.candidate_name,
            scheduled_at=request.scheduled_at,
            duration_minutes=request.duration_minutes,
            interviewers=[
                {
                    "name": interviewer.name,
                    "email": interviewer.email,
                    "user_id": interviewer.user_id
                }
                for interviewer in request.interviewers
            ],
            created_by=current_internal_id,
            resume_id=request.resume_id,
            title=request.title,
            description=request.description,
            questions=[q.model_dump() for q in request.questions] if request.questions else None
        )

        return ScheduleInterviewResponse(**result)

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error scheduling interview: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to schedule interview"
        )


@router.get(
    "",
    response_model=InterviewListResponse,
    summary="List all video interviews"
)
async def list_interviews(
    status_filter: Optional[str] = None,
    job_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user_id: str = Depends(get_current_user_id)
):
    """
    List all video interviews with optional filters.

    - **status**: Filter by status (scheduled, in_progress, completed, cancelled)
    - **job_id**: Filter by job description ID
    - **page**: Page number (default: 1)
    - **page_size**: Items per page (default: 20)
    """
    try:
        # Resolve raw user ID to internal UUID
        user_service = get_user_service()
        current_internal_id = user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Build query
        query = client.table("video_interviews").select("*", count="exact")
        
        # Filter by owner
        query = query.eq("created_by", current_internal_id)

        # Apply filters
        if status_filter:
            query = query.eq("status", status_filter)
        if job_id:
            query = query.eq("job_description_id", job_id)

        # Apply pagination
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)

        # Order by scheduled_at descending
        query = query.order("scheduled_at", desc=True)

        result = query.execute()

        return InterviewListResponse(
            interviews=[InterviewResponse(**interview) for interview in result.data],
            total=result.count or 0,
            page=page,
            page_size=page_size
        )

    except Exception as e:
        logger.error(f"Error listing interviews: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list interviews"
        )


@router.get(
    "/{interview_id}",
    response_model=InterviewDetailsResponse,
    summary="Get interview details"
)
async def get_interview(
    interview_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get detailed information about a specific interview.

    Includes participants, questions, and evaluations.
    """
    try:
        # Resolve raw user ID to internal UUID
        user_service = get_user_service()
        current_internal_id = user_service.resolve_user_id(user_id)
        
        service = get_video_interview_service()

        # Get interview
        interview = await service.get_interview_by_id(interview_id)
        if not interview or interview["created_by"] != current_internal_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        # Get related data
        participants = await service.get_interview_participants(interview_id)
        questions = await service.get_interview_questions(interview_id)

        # Get evaluations
        client = get_supabase()
        eval_result = client.table("video_interview_evaluations") \
            .select("*") \
            .eq("video_interview_id", interview_id) \
            .execute()

        return InterviewDetailsResponse(
            **interview,
            participants=[ParticipantResponse(**p) for p in participants],
            questions=[QuestionResponse(**q) for q in questions],
            evaluations=eval_result.data or []
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting interview: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get interview"
        )


@router.put(
    "/{interview_id}",
    response_model=InterviewResponse,
    summary="Update interview details"
)
async def update_interview(
    interview_id: str,
    request: UpdateInterviewRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Update interview details (scheduled time, duration, status)."""
    try:
        # Resolve raw user ID to internal UUID
        user_service = get_user_service()
        current_internal_id = user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Build update data
        update_data = {"updated_at": datetime.utcnow().isoformat()}
        if request.scheduled_at:
            update_data["scheduled_at"] = request.scheduled_at.isoformat()
        if request.duration_minutes:
            update_data["duration_minutes"] = request.duration_minutes
        if request.status:
            update_data["status"] = request.status.value
        if request.description is not None:
            update_data["description"] = request.description

        # Update interview
        result = client.table("video_interviews") \
            .update(update_data) \
            .eq("id", interview_id) \
            .eq("created_by", current_internal_id) \
            .execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        return InterviewResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating interview: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update interview"
        )


@router.delete(
    "/{interview_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete/cancel interview"
)
async def delete_interview(
    interview_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete or cancel an interview."""
    try:
        # Resolve raw user ID to internal UUID
        user_service = get_user_service()
        current_internal_id = user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Check if interview exists and belongs to user
        result = client.table("video_interviews") \
            .select("*") \
            .eq("id", interview_id) \
            .eq("created_by", current_internal_id) \
            .single() \
            .execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        # Delete interview (cascades to participants, questions, etc.)
        client.table("video_interviews") \
            .delete() \
            .eq("id", interview_id) \
            .eq("created_by", current_internal_id) \
            .execute()

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting interview: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete interview"
        )


@router.get(
    "/{interview_id}/participants",
    response_model=List[ParticipantResponse],
    summary="Get interview participants"
)
async def get_participants(
    interview_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get all participants for an interview."""
    try:
        service = get_video_interview_service()
        participants = await service.get_interview_participants(interview_id)
        return [ParticipantResponse(**p) for p in participants]

    except Exception as e:
        logger.error(f"Error getting participants: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get participants"
        )


@router.get(
    "/{interview_id}/questions",
    response_model=List[QuestionResponse],
    summary="Get interview questions"
)
async def get_questions(
    interview_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get all questions for an interview."""
    try:
        service = get_video_interview_service()
        questions = await service.get_interview_questions(interview_id)
        return [QuestionResponse(**q) for q in questions]

    except Exception as e:
        logger.error(f"Error getting questions: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get questions"
        )


# Webhook endpoints (called by 100ms)

@router.post(
    "/webhooks/session-started",
    status_code=status.HTTP_200_OK,
    summary="100ms webhook: Session started"
)
async def session_started_webhook(webhook: SessionStartedWebhook):
    """Handle 100ms session started webhook."""
    try:
        service = get_video_interview_service()

        # Update interview status to in_progress
        client = get_supabase()
        result = client.table("video_interviews") \
            .select("id") \
            .eq("room_id", webhook.room_id) \
            .single() \
            .execute()

        if result.data:
            interview_id = result.data["id"]
            await service.update_interview_status(
                interview_id,
                "in_progress",
                webhook.session_id
            )
            logger.info(f"Session started for interview: {interview_id}")

        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error handling session started webhook: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@router.post(
    "/webhooks/session-ended",
    status_code=status.HTTP_200_OK,
    summary="100ms webhook: Session ended"
)
async def session_ended_webhook(webhook: SessionEndedWebhook):
    """Handle 100ms session ended webhook."""
    try:
        logger.info(f"Session ended for room: {webhook.room_id}")
        # Recording will be handled by recording-ready webhook
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error handling session ended webhook: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@router.post(
    "/webhooks/recording-ready",
    status_code=status.HTTP_200_OK,
    summary="100ms webhook: Recording ready"
)
async def recording_ready_webhook(webhook: RecordingReadyWebhook):
    """Handle 100ms recording ready webhook."""
    try:
        service = get_video_interview_service()

        success = await service.handle_recording_ready_webhook(
            room_id=webhook.room_id,
            recording_id=webhook.recording_id,
            download_url=webhook.download_url,
            duration=webhook.duration
        )

        if success:
            logger.info(f"Recording processed for room: {webhook.room_id}")
            return {"status": "success"}
        else:
            return {"status": "error", "message": "Failed to process recording"}

    except Exception as e:
        logger.error(f"Error handling recording ready webhook: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


@router.post(
    "/{interview_id}/evaluate",
    status_code=status.HTTP_201_CREATED,
    summary="Create interview evaluation"
)
async def create_evaluation(
    interview_id: str,
    request: CreateEvaluationRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Create a human evaluation for an interview."""
    try:
        # Resolve raw user ID to internal UUID
        user_service = get_user_service()
        current_internal_id = user_service.resolve_user_id(user_id)
        
        client = get_supabase()
        
        # Verify interview ownership
        interview_check = client.table("video_interviews") \
            .select("id") \
            .eq("id", interview_id) \
            .eq("created_by", current_internal_id) \
            .single() \
            .execute()
            
        if not interview_check.data:
            raise HTTPException(status_code=404, detail="Interview not found")

        evaluation_data = {
            "video_interview_id": interview_id,
            "evaluator_id": current_internal_id,
            "evaluation_type": "human",
            "overall_score": request.overall_score,
            "communication_score": request.communication_score,
            "technical_score": request.technical_score,
            "problem_solving_score": request.problem_solving_score,
            "cultural_fit_score": request.cultural_fit_score,
            "strengths": request.strengths,
            "weaknesses": request.weaknesses,
            "key_highlights": request.key_highlights,
            "concerns": request.concerns,
            "recommendation": request.recommendation.value,
            "next_steps": request.next_steps
        }

        result = client.table("video_interview_evaluations") \
            .insert(evaluation_data) \
            .execute()

        return result.data[0]

    except Exception as e:
        logger.error(f"Error creating evaluation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create evaluation"
        )


@router.get(
    "/{interview_id}/recording",
    summary="Get recording signed URL"
)
async def get_recording_url(
    interview_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get a signed URL to access the interview recording."""
    try:
        service = get_video_interview_service()
        interview = await service.get_interview_by_id(interview_id)

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found"
            )

        if not interview.get("recording_path"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recording not available yet"
            )

        # Generate signed URL (valid for 7 days)
        from app.services.storage_service import get_storage_service
        storage = get_storage_service()

        signed_url = await storage.get_signed_url(
            bucket_type="interview_recordings",
            file_path=interview["recording_path"],
            expires_in=604800  # 7 days
        )

        return {
            "recording_url": signed_url,
            "duration_seconds": interview.get("recording_duration_seconds"),
            "expires_in": 604800
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting recording URL: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get recording URL"
        )
