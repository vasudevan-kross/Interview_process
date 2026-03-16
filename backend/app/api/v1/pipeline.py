"""Pipeline API: Unified candidate lifecycle tracking."""

import logging
from typing import Optional
from io import BytesIO
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from app.auth.dependencies import get_current_org_context, OrgContext
from app.auth.permissions import require_permission
from app.services.pipeline_service import get_pipeline_service
from app.utils.csv_field_mapper import CSVFieldMapper

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
    ctx: OrgContext = Depends(require_permission("pipeline:view")),
    service=Depends(get_pipeline_service),
):
    """List coding interviews available for candidate promotion."""
    return service.get_available_interviews(ctx.user_id, job_id=job_id, org_id=ctx.org_id)


@router.get("/targets/campaigns")
async def get_available_campaigns(
    job_id: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission("pipeline:view")),
    service=Depends(get_pipeline_service),
):
    """List voice screening campaigns available for candidate promotion."""
    return service.get_available_campaigns(ctx.user_id, job_id=job_id, org_id=ctx.org_id)


# Decision & delete (candidates/ prefix won't collide with job UUIDs)
@router.patch("/candidates/{candidate_id}/decision")
async def set_decision(
    candidate_id: str,
    body: DecisionUpdate,
    ctx: OrgContext = Depends(require_permission("pipeline:manage")),
    service=Depends(get_pipeline_service),
):
    """Set final hiring decision on a pipeline candidate."""
    try:
        return service.set_decision(candidate_id, ctx.user_id, body.decision, body.notes, org_id=ctx.org_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/candidates/{candidate_id}")
async def delete_pipeline_candidate(
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission("pipeline:manage")),
    service=Depends(get_pipeline_service),
):
    """Remove a candidate from the pipeline."""
    deleted = service.delete_pipeline_candidate(candidate_id, ctx.user_id, org_id=ctx.org_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return {"deleted": True}


# ── Dynamic routes (/{job_id}/*) ──────────────────────────────────────────

@router.get("/{job_id}/settings")
async def get_settings(
    job_id: str,
    ctx: OrgContext = Depends(require_permission("pipeline:view")),
    service=Depends(get_pipeline_service),
):
    """Get pipeline threshold settings for a job."""
    try:
        return service.get_pipeline_settings(job_id, ctx.user_id, org_id=ctx.org_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.patch("/{job_id}/settings")
async def update_settings(
    job_id: str,
    body: SettingsUpdate,
    ctx: OrgContext = Depends(require_permission("pipeline:manage")),
    service=Depends(get_pipeline_service),
):
    """Update pipeline threshold settings."""
    try:
        return service.update_pipeline_settings(job_id, ctx.user_id, body.model_dump(), org_id=ctx.org_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{job_id}/stats")
async def get_pipeline_stats(
    job_id: str,
    ctx: OrgContext = Depends(require_permission("pipeline:view")),
    service=Depends(get_pipeline_service),
):
    """Get pipeline statistics."""
    try:
        return service.get_pipeline_stats(job_id, ctx.user_id, org_id=ctx.org_id)
    except Exception as e:
        logger.error(f"Failed to get pipeline stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}/candidates")
async def get_pipeline_candidates(
    job_id: str,
    stage: Optional[str] = None,
    recommendation: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission("pipeline:view")),
    service=Depends(get_pipeline_service),
):
    """List pipeline candidates with optional filters."""
    try:
        return service.get_pipeline_candidates(job_id, ctx.user_id, stage, recommendation, org_id=ctx.org_id)
    except Exception as e:
        logger.error(f"Failed to list pipeline candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{job_id}/promote")
async def promote_to_pipeline(
    job_id: str,
    body: PromoteRequest,
    ctx: OrgContext = Depends(require_permission("pipeline:manage")),
    service=Depends(get_pipeline_service),
):
    """Bulk add resumes to the pipeline."""
    try:
        return service.promote_to_pipeline(job_id, body.resume_ids, ctx.user_id, org_id=ctx.org_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{job_id}/candidates/import")
async def import_candidates_bulk(
    job_id: str,
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_permission("pipeline:manage")),
    service=Depends(get_pipeline_service),
):
    """
    Import candidates from CSV/Excel file without resumes.
    Intelligently maps column names to standard fields.
    """
    try:
        # Read file
        content = await file.read()

        # Parse based on file type
        if file.filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(BytesIO(content))
        else:
            raise HTTPException(
                status_code=400,
                detail="Only CSV and Excel files supported (.csv, .xlsx, .xls)"
            )

        # Map columns intelligently
        field_map = CSVFieldMapper.map_columns(df.columns.tolist())

        # Validate required fields found
        if not field_map['name']:
            raise HTTPException(
                status_code=400,
                detail=f"Could not find 'name' column. Available columns: {list(df.columns)}"
            )
        if not field_map['email']:
            raise HTTPException(
                status_code=400,
                detail=f"Could not find 'email' column. Available columns: {list(df.columns)}"
            )

        # Extract candidate data
        candidates = []
        for _, row in df.iterrows():
            candidate = {
                "name": str(row[field_map['name']]).strip(),
                "email": str(row[field_map['email']]).strip().lower(),
            }

            # Add phone if mapped and present
            if field_map['phone'] and row.get(field_map['phone']):
                phone = CSVFieldMapper.format_phone_number(row[field_map['phone']])
                if phone:
                    candidate["phone"] = phone

            # Skip empty rows
            if candidate["name"] and candidate["email"] and candidate["name"] != "nan":
                candidates.append(candidate)

        if not candidates:
            raise HTTPException(
                status_code=400,
                detail="No valid candidate data found in file"
            )

        # Import to pipeline
        result = service.bulk_import_candidates(
            job_id=job_id,
            candidates=candidates,
            user_id=ctx.user_id,
            org_id=ctx.org_id
        )

        return {
            "message": f"Successfully imported {result['created']} candidates",
            **result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{job_id}/advance")
async def advance_candidates(
    job_id: str,
    body: AdvanceRequest,
    ctx: OrgContext = Depends(require_permission("pipeline:manage")),
    service=Depends(get_pipeline_service),
):
    """Move candidates to a forward stage (technical/voice/completed)."""
    try:
        return service.advance_candidates(
            job_id,
            body.candidate_ids,
            body.target_stage,
            ctx.user_id,
            interview_id=body.interview_id,
            campaign_id=body.campaign_id,
            org_id=ctx.org_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{job_id}")
async def get_pipeline_board(
    job_id: str,
    ctx: OrgContext = Depends(require_permission("pipeline:view")),
    service=Depends(get_pipeline_service),
):
    """Get pipeline board grouped by stage (Kanban data)."""
    try:
        return service.get_pipeline_board(job_id, ctx.user_id, org_id=ctx.org_id)
    except Exception as e:
        logger.error(f"Failed to get pipeline board: {e}")
        raise HTTPException(status_code=500, detail=str(e))
