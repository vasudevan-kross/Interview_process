"""Video Interviews API - local avatar interview flow (separate from voice screening)."""

import logging
from typing import Optional
import csv
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth.dependencies import OrgContext
from app.auth.permissions import require_permission
from app.schemas.video_interviews import (
    VideoInterviewCampaignCreate,
    VideoInterviewCampaignResponse,
    VideoInterviewCampaignUpdate,
    VideoInterviewCandidateCreate,
    VideoInterviewCandidateUpdate,
    VideoInterviewCandidatePublic,
    VideoInterviewCandidateResponse,
    VideoInterviewSessionResponse,
    VideoInterviewSessionStartResponse,
    VideoInterviewTurnRequest,
    VideoInterviewTurnResponse,
    VideoInterviewAudioTurnResponse,
)
from app.services.video_interview_service import get_video_interview_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/video-interviews", tags=["video-interviews"])
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Campaigns (org-scoped)
# ---------------------------------------------------------------------------


@router.post(
    "/campaigns",
    response_model=VideoInterviewCampaignResponse,
    summary="Create video interview campaign",
)
@limiter.limit("30/minute")
async def create_campaign(
    request: Request,
    payload: VideoInterviewCampaignCreate,
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    try:
        service = get_video_interview_service()
        return await service.create_campaign(
            ctx.org_id, ctx.user_id, payload.model_dump()
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error creating video interview campaign: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create campaign")


@router.post(
    "/campaigns/generate-questions",
    summary="Generate video interview questions",
)
@limiter.limit("10/minute")
async def generate_questions(
    request: Request,
    payload: VideoInterviewCampaignCreate,
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    try:
        service = get_video_interview_service()
        questions = await service._generate_questions(payload.model_dump())
        return {"questions": questions}
    except Exception as exc:
        logger.error(f"Error generating questions: {exc}")
        raise HTTPException(status_code=500, detail="Failed to generate questions")


@router.get(
    "/campaigns",
    response_model=list[VideoInterviewCampaignResponse],
    summary="List video interview campaigns",
)
@limiter.limit("60/minute")
async def list_campaigns(
    request: Request,
    is_active: Optional[bool] = None,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_video_interview_service()
        return await service.list_campaigns(ctx.org_id, is_active)
    except Exception as exc:
        logger.error(f"Error listing video interview campaigns: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list campaigns")


@router.get(
    "/campaigns/{campaign_id}",
    response_model=VideoInterviewCampaignResponse,
    summary="Get video interview campaign",
)
@limiter.limit("60/minute")
async def get_campaign(
    request: Request,
    campaign_id: str,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_video_interview_service()
        return await service.get_campaign(ctx.org_id, campaign_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error fetching campaign: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch campaign")


@router.patch(
    "/campaigns/{campaign_id}",
    response_model=VideoInterviewCampaignResponse,
    summary="Update video interview campaign",
)
@limiter.limit("30/minute")
async def update_campaign(
    request: Request,
    campaign_id: str,
    payload: VideoInterviewCampaignUpdate,
    ctx: OrgContext = Depends(require_permission("interview:edit")),
):
    try:
        service = get_video_interview_service()
        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        return await service.update_campaign(ctx.org_id, campaign_id, updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error updating campaign: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update campaign")


@router.delete(
    "/campaigns/{campaign_id}",
    response_model=VideoInterviewCampaignResponse,
    summary="Delete video interview campaign",
)
@limiter.limit("20/minute")
async def delete_campaign_route(
    request: Request,
    campaign_id: str,
    ctx: OrgContext = Depends(require_permission("interview:delete")),
):
    try:
        service = get_video_interview_service()
        return await service.delete_campaign(ctx.org_id, campaign_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error deleting campaign: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete campaign")


# ---------------------------------------------------------------------------
# Candidates (org-scoped)
# ---------------------------------------------------------------------------


@router.post(
    "/candidates",
    response_model=VideoInterviewCandidateResponse,
    summary="Create video interview candidate",
)
@limiter.limit("60/minute")
async def create_candidate(
    request: Request,
    campaign_id: str = Form(...),
    name: str = Form(...),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    resume: Optional[UploadFile] = File(None),
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    resume_text: Optional[str] = None
    resume_parsed: Optional[dict] = None

    if resume and resume.filename:
        try:
            from app.services.resume_parser_llm import ResumeParserLLM
            parser = ResumeParserLLM()
            file_bytes = await resume.read()
            result = await parser.parse_resume(file_bytes, resume.filename)
            resume_text = result.get("raw_text")
            resume_parsed = result.get("parsed_data")
        except Exception as exc:
            logger.warning(f"Resume parsing failed for candidate '{name}': {exc}")
            # Non-fatal — candidate is created without resume context

    payload = {
        "campaign_id": campaign_id,
        "name": name,
        "email": email or None,
        "phone": phone or None,
        "resume_text": resume_text,
        "resume_parsed": resume_parsed,
    }

    try:
        service = get_video_interview_service()
        return await service.create_candidate(ctx.org_id, ctx.user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error creating candidate: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create candidate")


@router.post("/candidates/import", summary="Import video interview candidates")
@limiter.limit("10/minute")
async def import_candidates(
    request: Request,
    campaign_id: str = Form(...),
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    try:
        filename = file.filename or "candidates.csv"
        content = await file.read()
        rows = []

        if filename.lower().endswith(".csv"):
            text = content.decode("utf-8", errors="replace")
            reader = csv.DictReader(StringIO(text))
            for row in reader:
                rows.append(
                    {
                        "name": row.get("name")
                        or row.get("full_name")
                        or row.get("candidate_name"),
                        "email": row.get("email") or row.get("candidate_email"),
                        "phone": row.get("phone") or row.get("candidate_phone"),
                    }
                )
        elif filename.lower().endswith((".xlsx", ".xls")):
            import pandas as pd
            from io import BytesIO

            df = pd.read_excel(BytesIO(content))
            df.columns = [str(col).strip().lower() for col in df.columns]
            for _, row in df.iterrows():
                rows.append(
                    {
                        "name": row.get("name")
                        or row.get("full_name")
                        or row.get("candidate_name"),
                        "email": row.get("email") or row.get("candidate_email"),
                        "phone": row.get("phone") or row.get("candidate_phone"),
                    }
                )
        else:
            raise ValueError("Unsupported file type. Upload CSV or Excel.")

        service = get_video_interview_service()
        candidates = await service.bulk_import_candidates(
            ctx.org_id, ctx.user_id, campaign_id, rows
        )
        return {"imported": len(candidates), "candidates": candidates}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error importing candidates: {exc}")
        raise HTTPException(status_code=500, detail="Failed to import candidates")


@router.get(
    "/candidates",
    response_model=list[VideoInterviewCandidateResponse],
    summary="List video interview candidates",
)
@limiter.limit("60/minute")
async def list_candidates(
    request: Request,
    campaign_id: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_video_interview_service()
        return await service.list_candidates(ctx.org_id, campaign_id)
    except Exception as exc:
        logger.error(f"Error listing candidates: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list candidates")


@router.patch(
    "/candidates/{candidate_id}",
    response_model=VideoInterviewCandidateResponse,
    summary="Update video interview candidate",
)
@limiter.limit("30/minute")
async def update_candidate_route(
    request: Request,
    candidate_id: str,
    payload: VideoInterviewCandidateUpdate,
    ctx: OrgContext = Depends(require_permission("interview:edit")),
):
    try:
        service = get_video_interview_service()
        return await service.update_candidate(
            ctx.org_id, candidate_id,
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error updating candidate: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update candidate")


@router.delete(
    "/candidates/{candidate_id}",
    response_model=VideoInterviewCandidateResponse,
    summary="Delete video interview candidate",
)
@limiter.limit("30/minute")
async def delete_candidate_route(
    request: Request,
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission("interview:delete")),
):
    try:
        service = get_video_interview_service()
        return await service.delete_candidate(ctx.org_id, candidate_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error deleting candidate: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete candidate")


# ---------------------------------------------------------------------------
# Public candidate flow (token-based)
# ---------------------------------------------------------------------------


@router.get(
    "/candidates/token/{token}",
    response_model=VideoInterviewCandidatePublic,
    summary="Get public candidate info",
)
@limiter.limit("120/minute")
async def get_candidate_by_token(request: Request, token: str):
    try:
        service = get_video_interview_service()
        data = await service.get_candidate_by_token(token)
        candidate = data["candidate"]
        campaign = data["campaign"]
        return {
            "id": candidate["id"],
            "interview_token": candidate["interview_token"],
            "name": candidate["name"],
            "status": candidate["status"],
            "campaign_id": campaign["id"],
            "campaign_name": campaign["name"],
            "job_role": campaign["job_role"],
            "interview_duration_minutes": campaign.get(
                "interview_duration_minutes", 20
            ),
            "scheduled_start_time": campaign.get("scheduled_start_time"),
            "scheduled_end_time": campaign.get("scheduled_end_time"),
            "grace_period_minutes": campaign.get("grace_period_minutes", 15),
            "avatar_config": campaign.get("avatar_config") or {},
            "questions": campaign.get("questions") or [],
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error fetching candidate by token: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch candidate")


@router.post(
    "/candidates/token/{token}/session/start",
    response_model=VideoInterviewSessionStartResponse,
    summary="Start video interview session",
)
@limiter.limit("60/minute")
async def start_session(request: Request, token: str):
    try:
        service = get_video_interview_service()
        data = await service.start_session(token)
        session = data["session"]
        campaign = data["campaign"]
        questions = session.get("questions") or []
        current = questions[0] if questions else None
        audio_base64 = None
        audio_content_type = None
        if current and current.get("question_text"):
            try:
                audio_bytes, audio_content_type = service.tts.synthesize(
                    current["question_text"]
                )
                import base64

                audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception as exc:
                logger.warning(f"TTS failed on start: {exc}")
        return {
            "session_id": session["id"],
            "campaign_id": campaign["id"],
            "candidate_id": data["candidate"]["id"],
            "questions": questions,
            "current_question": current,
            "interview_duration_minutes": campaign.get(
                "interview_duration_minutes", 20
            ),
            "avatar_config": campaign.get("avatar_config") or {},
            "audio_base64": audio_base64,
            "audio_content_type": audio_content_type,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error starting session: {exc}")
        raise HTTPException(status_code=500, detail="Failed to start session")


@router.post(
    "/sessions/turn",
    response_model=VideoInterviewTurnResponse,
    summary="Submit candidate answer",
)
@limiter.limit("120/minute")
async def process_turn(request: Request, payload: VideoInterviewTurnRequest):
    try:
        service = get_video_interview_service()
        result = await service.process_turn(payload.session_id, payload.answer_text)
        return {
            "session_id": payload.session_id,
            "next_question": result.get("next_question"),
            "done": result.get("done", False),
            "summary": result.get("summary"),
            "evaluation": result.get("evaluation"),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error processing turn: {exc}")
        raise HTTPException(status_code=500, detail="Failed to process answer")


@router.post(
    "/sessions/turn/audio",
    response_model=VideoInterviewAudioTurnResponse,
    summary="Submit candidate audio answer",
)
@limiter.limit("60/minute")
async def process_audio_turn(
    request: Request,
    session_id: str = Form(...),
    audio: UploadFile = File(...),
):
    try:
        service = get_video_interview_service()
        audio_bytes = await audio.read()
        ext = ".webm"
        if audio.filename and "." in audio.filename:
            ext = f".{audio.filename.split('.')[-1]}"
        result = await service.process_audio_turn(session_id, audio_bytes, ext)
        return {
            "session_id": session_id,
            "transcript": result.get("transcript"),
            "next_question": result.get("next_question"),
            "done": result.get("done", False),
            "summary": result.get("summary"),
            "evaluation": result.get("evaluation"),
            "speech_detected": result.get("speech_detected", True),
            "audio_base64": result.get("audio_base64"),
            "audio_content_type": result.get("audio_content_type"),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error processing audio turn: {exc}")
        raise HTTPException(status_code=500, detail="Failed to process audio")


@router.post(
    "/sessions/{session_id}/recording",
    response_model=VideoInterviewSessionResponse,
    summary="Upload interview recording",
)
@limiter.limit("30/minute")
async def upload_recording(
    request: Request,
    session_id: str,
    recording: UploadFile = File(...),
    duration_seconds: Optional[int] = Form(None),
):
    try:
        service = get_video_interview_service()
        file_data = await recording.read()
        logger.info(
            f"Recording upload: session={session_id} size={len(file_data)} "
            f"content_type={recording.content_type} filename={recording.filename}"
        )
        updated = await service.upload_recording(
            session_id=session_id,
            file_data=file_data,
            filename=recording.filename or "interview.webm",
            content_type=recording.content_type,
            duration_seconds=duration_seconds,
        )
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Recording upload FAILED session={session_id}: {type(exc).__name__}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload recording")


@router.post(
    "/sessions/{session_id}/finalize",
    response_model=VideoInterviewSessionResponse,
    summary="Manually finalize a stuck in_progress session",
)
@limiter.limit("10/minute")
async def finalize_session(
    request: Request,
    session_id: str,
    ctx: OrgContext = Depends(require_permission("interview:edit")),
):
    try:
        service = get_video_interview_service()
        return await service.finalize_stuck_session(session_id, ctx.org_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error finalizing session: {exc}")
        raise HTTPException(status_code=500, detail="Failed to finalize session")


@router.get(
    "/sessions/{session_id}",
    response_model=VideoInterviewSessionResponse,
    summary="Get video interview session",
)
@limiter.limit("60/minute")
async def get_session(
    request: Request,
    session_id: str,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_video_interview_service()
        return await service.get_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error(f"Error fetching session: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch session")


@router.get(
    "/sessions",
    response_model=list[VideoInterviewSessionResponse],
    summary="List video interview sessions",
)
@limiter.limit("60/minute")
async def list_sessions(
    request: Request,
    campaign_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_video_interview_service()
        return await service.list_sessions(ctx.org_id, campaign_id, candidate_id)
    except Exception as exc:
        logger.error(f"Error listing sessions: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list sessions")


from fastapi import WebSocket  # noqa: E402


@router.websocket("/ws/{token}")
async def video_interview_websocket(websocket: WebSocket, token: str):
    """Real-time WebSocket interview session."""
    from app.services.video_interview_ws_handler import VideoInterviewWSHandler
    handler = VideoInterviewWSHandler(websocket, token)
    await handler.run()
