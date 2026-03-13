"""Pipeline API: Unified candidate lifecycle tracking."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.auth.dependencies import get_current_user_id
from app.services.pipeline_service import get_pipeline_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


# ── Request schemas ───────────────────────────────────────────────────────

class PromoteRequest(BaseModel):
    resume_ids: list[str]


class AdvanceRequest(BaseModel):
    candidate_ids: list[str]
    target_stage: str  # technical_assessment | voice_screening | completed
    interview_id: Optional[str] = None
    campaign_id: Optional[str] = None


class SettingsUpdate(BaseModel):
    highly_recommended_threshold: float = 85
    recommended_threshold: float = 65


class DecisionUpdate(BaseModel):
    decision: str  # pending | selected | rejected | hold
    notes: Optional[str] = None


# ── Static routes FIRST (before /{job_id} to avoid conflicts) ────────────

# Available targets for promotion
@router.get("/targets/interviews")
async def get_available_interviews(
    job_id: Optional[str] = None,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """List coding interviews available for candidate promotion."""
    return service.get_available_interviews(current_user_id, job_id=job_id)


@router.get("/targets/campaigns")
async def get_available_campaigns(
    job_id: Optional[str] = None,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """List voice screening campaigns available for candidate promotion."""
    return service.get_available_campaigns(current_user_id, job_id=job_id)


# Decision & delete (candidates/ prefix won't collide with job UUIDs)
@router.patch("/candidates/{candidate_id}/decision")
async def set_decision(
    candidate_id: str,
    body: DecisionUpdate,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Set final hiring decision on a pipeline candidate."""
    try:
        return service.set_decision(candidate_id, current_user_id, body.decision, body.notes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/candidates/{candidate_id}")
async def delete_pipeline_candidate(
    candidate_id: str,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Remove a candidate from the pipeline."""
    deleted = service.delete_pipeline_candidate(candidate_id, current_user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return {"deleted": True}


# ── Dynamic routes (/{job_id}/*) ──────────────────────────────────────────

@router.get("/{job_id}/settings")
async def get_settings(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Get pipeline threshold settings for a job."""
    try:
        return service.get_pipeline_settings(job_id, current_user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.patch("/{job_id}/settings")
async def update_settings(
    job_id: str,
    body: SettingsUpdate,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Update pipeline threshold settings."""
    try:
        return service.update_pipeline_settings(job_id, current_user_id, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{job_id}/stats")
async def get_pipeline_stats(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Get pipeline statistics."""
    try:
        return service.get_pipeline_stats(job_id, current_user_id)
    except Exception as e:
        logger.error(f"Failed to get pipeline stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}/candidates")
async def get_pipeline_candidates(
    job_id: str,
    stage: Optional[str] = None,
    recommendation: Optional[str] = None,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """List pipeline candidates with optional filters."""
    try:
        return service.get_pipeline_candidates(job_id, current_user_id, stage, recommendation)
    except Exception as e:
        logger.error(f"Failed to list pipeline candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{job_id}/promote")
async def promote_to_pipeline(
    job_id: str,
    body: PromoteRequest,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Bulk add resumes to the pipeline."""
    try:
        return service.promote_to_pipeline(job_id, body.resume_ids, current_user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{job_id}/advance")
async def advance_candidates(
    job_id: str,
    body: AdvanceRequest,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Move candidates to a forward stage (technical/voice/completed)."""
    try:
        return service.advance_candidates(
            job_id,
            body.candidate_ids,
            body.target_stage,
            current_user_id,
            interview_id=body.interview_id,
            campaign_id=body.campaign_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{job_id}")
async def get_pipeline_board(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
    service=Depends(get_pipeline_service),
):
    """Get pipeline board grouped by stage (Kanban data)."""
    try:
        return service.get_pipeline_board(job_id, current_user_id)
    except Exception as e:
        logger.error(f"Failed to get pipeline board: {e}")
        raise HTTPException(status_code=500, detail=str(e))
