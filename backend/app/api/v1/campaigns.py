"""
API routes for Hiring Campaigns
"""

import logging
import io
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse

from app.schemas.campaigns import (
    CampaignCreate,
    CampaignUpdate,
    CampaignResponse,
    CampaignWithStats,
    CampaignListResponse,
    CandidateImportPreview,
    CandidateImportRequest,
    CandidateImportResponse,
    PipelineCandidateCreate,
    PipelineCandidateResponse,
    CampaignAnalytics,
    CampaignCandidatesSummary,
    InterviewSlot,
)
from app.auth.dependencies import OrgContext
from app.auth.permissions import require_permission
from app.services.campaign_service import get_campaign_service
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])


# ============================================================================
# Campaign CRUD Endpoints
# ============================================================================


@router.post("", response_model=CampaignResponse, summary="Create a new campaign")
async def create_campaign(
    campaign: CampaignCreate,
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    """Create a new hiring campaign (Pipeline 1, 2, 3...)"""
    try:
        service = get_campaign_service()

        metadata_dict = campaign.metadata.dict() if campaign.metadata else None

        result = service.create_campaign(
            org_id=ctx.org_id,
            user_id=ctx.user_id,
            name=campaign.name,
            description=campaign.description,
            metadata=metadata_dict,
        )

        return result

    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=CampaignListResponse, summary="List all campaigns")
async def list_campaigns(
    status: Optional[str] = Query(
        None, description="Filter by status: active, completed, archived"
    ),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    """List all hiring campaigns for the organization"""
    try:
        service = get_campaign_service()
        campaigns = service.list_campaigns(
            org_id=ctx.org_id, status=status, limit=limit, offset=offset
        )

        # Add statistics to each campaign
        campaigns_with_stats = []
        for campaign in campaigns:
            try:
                stats = service.get_campaign_statistics(campaign["id"])
                campaigns_with_stats.append({**campaign, "statistics": stats})
            except Exception as e:
                logger.warning(
                    f"Could not fetch stats for campaign {campaign['id']}: {e}"
                )
                campaigns_with_stats.append({**campaign, "statistics": None})

        return {"campaigns": campaigns_with_stats, "total": len(campaigns_with_stats)}

    except Exception as e:
        logger.error(f"Error listing campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/{campaign_id}", response_model=CampaignWithStats, summary="Get campaign details"
)
async def get_campaign(
    campaign_id: str, ctx: OrgContext = Depends(require_permission("interview:view"))
):
    """Get campaign details with statistics"""
    try:
        service = get_campaign_service()
        campaign = service.get_campaign(campaign_id, ctx.org_id)

        # Add statistics
        try:
            stats = service.get_campaign_statistics(campaign_id)
            campaign["statistics"] = stats
        except Exception as e:
            logger.warning(f"Could not fetch stats: {e}")
            campaign["statistics"] = None

        return campaign

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch(
    "/{campaign_id}", response_model=CampaignResponse, summary="Update campaign"
)
async def update_campaign(
    campaign_id: str,
    campaign: CampaignUpdate,
    ctx: OrgContext = Depends(require_permission("interview:update")),
):
    """Update campaign details"""
    try:
        service = get_campaign_service()

        update_data = campaign.dict(exclude_unset=True)
        if "metadata" in update_data and update_data["metadata"]:
            update_data["metadata"] = (
                update_data["metadata"].dict()
                if hasattr(update_data["metadata"], "dict")
                else update_data["metadata"]
            )

        result = service.update_campaign(campaign_id, ctx.org_id, update_data)
        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{campaign_id}", summary="Archive campaign")
async def delete_campaign(
    campaign_id: str, ctx: OrgContext = Depends(require_permission("interview:delete"))
):
    """Archive a campaign (soft delete)"""
    try:
        service = get_campaign_service()
        service.delete_campaign(campaign_id, ctx.org_id)
        return {"message": "Campaign archived successfully"}

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error archiving campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Campaign Analytics Endpoints
# ============================================================================


@router.get("/{campaign_id}/analytics", summary="Get campaign analytics")
async def get_campaign_analytics(
    campaign_id: str, ctx: OrgContext = Depends(require_permission("interview:view"))
):
    """Get detailed analytics for a campaign"""
    try:
        service = get_campaign_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        # Get statistics and summary
        stats = service.get_campaign_statistics(campaign_id)
        summary = service.get_campaign_candidates_summary(campaign_id)

        return {"campaign_id": campaign_id, "statistics": stats, "job_summary": summary}

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching campaign analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Campaign Candidates Endpoints
# ============================================================================


@router.get(
    "/{campaign_id}/candidates",
    response_model=List[PipelineCandidateResponse],
    summary="Get campaign candidates",
)
async def get_campaign_candidates(
    campaign_id: str,
    job_id: Optional[str] = Query(None, description="Filter by job description ID"),
    stage: Optional[str] = Query(None, description="Filter by stage"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    """Get all candidates for a campaign with optional filters"""
    try:
        service = get_campaign_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        candidates = service.get_campaign_candidates(
            campaign_id=campaign_id,
            org_id=ctx.org_id,
            job_id=job_id,
            stage=stage,
            limit=limit,
            offset=offset,
        )

        return candidates

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching campaign candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{campaign_id}/candidates",
    response_model=PipelineCandidateResponse,
    summary="Add candidate to campaign",
)
async def add_candidate_to_campaign(
    campaign_id: str,
    candidate: PipelineCandidateCreate,
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    """Add a single candidate to a campaign"""
    try:
        service = get_campaign_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        interview_slot_dict = (
            candidate.interview_slot.dict() if candidate.interview_slot else None
        )

        result = service.add_candidate_to_campaign(
            campaign_id=campaign_id,
            org_id=ctx.org_id,
            job_id=str(candidate.job_id),
            candidate_name=candidate.candidate_name,
            candidate_email=candidate.candidate_email,
            candidate_phone=candidate.candidate_phone,
            interview_slot=interview_slot_dict,
            created_by=ctx.user_id,
        )

        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding candidate to campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Excel Import Endpoints
# ============================================================================


@router.post(
    "/{campaign_id}/import/preview",
    response_model=CandidateImportPreview,
    summary="Preview Excel import",
)
async def preview_candidate_import(
    campaign_id: str,
    file: UploadFile = File(..., description="Excel file (.xlsx)"),
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    """
    Preview candidates from Excel file before importing.
    Auto-detects columns and maps to job descriptions.
    """
    try:
        service = get_campaign_service()
        supabase = get_supabase()

        # Verify campaign belongs to org
        campaign = service.get_campaign(campaign_id, ctx.org_id)

        # Read Excel file
        import openpyxl

        contents = await file.read()
        workbook = openpyxl.load_workbook(io.BytesIO(contents))
        sheet = workbook.active

        # Parse header row
        headers = [cell.value for cell in sheet[1]]

        # Auto-detect column mappings (case-insensitive)
        col_map = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            header_lower = str(header).lower().strip()

            if "email" in header_lower or "@" in header_lower:
                col_map["email"] = idx
            elif "name" in header_lower and "email" not in header_lower:
                col_map["name"] = idx
            elif "phone" in header_lower or "mobile" in header_lower:
                col_map["phone"] = idx
            elif (
                "job" in header_lower
                or "role" in header_lower
                or "position" in header_lower
            ):
                col_map["job_role"] = idx
            elif (
                "slot" in header_lower
                or "batch" in header_lower
                or "time" in header_lower
            ):
                col_map["slot"] = idx
            elif "note" in header_lower or "remark" in header_lower:
                col_map["notes"] = idx

        # Parse data rows
        candidates = []
        errors = []

        for row_idx, row in enumerate(
            sheet.iter_rows(min_row=2, values_only=True), start=2
        ):
            try:
                email = (
                    row[col_map["email"]].strip()
                    if "email" in col_map and row[col_map["email"]]
                    else None
                )
                name = (
                    row[col_map["name"]].strip()
                    if "name" in col_map and row[col_map["name"]]
                    else None
                )

                if not email or not name:
                    errors.append(f"Row {row_idx}: Missing email or name")
                    continue

                candidate = {
                    "email": email,
                    "name": name,
                    "phone": row[col_map["phone"]].strip()
                    if "phone" in col_map and row[col_map["phone"]]
                    else None,
                    "job_role": row[col_map["job_role"]].strip()
                    if "job_role" in col_map and row[col_map["job_role"]]
                    else None,
                    "slot": row[col_map["slot"]].strip()
                    if "slot" in col_map and row[col_map["slot"]]
                    else None,
                    "notes": row[col_map["notes"]].strip()
                    if "notes" in col_map and row[col_map["notes"]]
                    else None,
                }

                candidates.append(candidate)

            except Exception as e:
                errors.append(f"Row {row_idx}: {str(e)}")

        # Get available job descriptions for mapping
        job_results = (
            supabase.table("job_descriptions")
            .select("id, title")
            .eq("org_id", ctx.org_id)
            .execute()
        )
        available_jobs = {job["title"]: job["id"] for job in (job_results.data or [])}

        # Auto-map job roles to job descriptions
        job_mappings = {}
        for candidate in candidates:
            if candidate["job_role"] and candidate["job_role"] not in job_mappings:
                # Try exact match first
                if candidate["job_role"] in available_jobs:
                    job_mappings[candidate["job_role"]] = available_jobs[
                        candidate["job_role"]
                    ]
                else:
                    # Try case-insensitive partial match
                    for job_title, job_id in available_jobs.items():
                        if candidate["job_role"].lower() in job_title.lower():
                            job_mappings[candidate["job_role"]] = job_id
                            break
                    if candidate["job_role"] not in job_mappings:
                        job_mappings[candidate["job_role"]] = None  # Unmapped

        # Get campaign slots for mapping
        campaign_metadata = campaign.get("metadata", {})
        campaign_slots = campaign_metadata.get("slots", [])
        slot_names = (
            [slot["name"] for slot in campaign_slots]
            if isinstance(campaign_slots, list)
            else []
        )

        # Auto-map slots
        slot_mappings = {}
        for candidate in candidates:
            if candidate["slot"] and candidate["slot"] not in slot_mappings:
                # Try exact match
                if candidate["slot"] in slot_names:
                    slot_mappings[candidate["slot"]] = candidate["slot"]
                else:
                    # Try case-insensitive partial match
                    for slot_name in slot_names:
                        if candidate["slot"].lower() in slot_name.lower():
                            slot_mappings[candidate["slot"]] = slot_name
                            break
                    if candidate["slot"] not in slot_mappings:
                        slot_mappings[candidate["slot"]] = None

        return {
            "total_rows": len(candidates) + len(errors),
            "valid_rows": len(candidates),
            "invalid_rows": len(errors),
            "candidates": candidates,
            "job_mappings": job_mappings,
            "slot_mappings": slot_mappings,
            "errors": errors,
        }

    except Exception as e:
        logger.error(f"Error previewing import: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{campaign_id}/import",
    response_model=CandidateImportResponse,
    summary="Import candidates from Excel",
)
async def import_candidates(
    campaign_id: str,
    import_request: CandidateImportRequest,
    ctx: OrgContext = Depends(require_permission("interview:create")),
):
    """Import candidates after preview and mapping confirmation"""
    try:
        service = get_campaign_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        # Prepare candidates for bulk insert
        candidates_to_import = []
        errors = []

        for candidate_row in import_request.candidates:
            try:
                # Get mapped job_id
                job_id = import_request.job_mappings.get(candidate_row.job_role)
                if not job_id:
                    errors.append(
                        f"{candidate_row.email}: No job description mapped for '{candidate_row.job_role}'"
                    )
                    continue

                # Prepare interview slot if mapped
                interview_slot = None
                if candidate_row.slot:
                    mapped_slot = import_request.slot_mappings.get(candidate_row.slot)
                    if mapped_slot:
                        interview_slot = {"slot_name": mapped_slot}

                candidate_data = {
                    "name": candidate_row.name,
                    "email": candidate_row.email,
                    "phone": candidate_row.phone,
                    "job_id": job_id,
                    "interview_slot": interview_slot,
                }

                candidates_to_import.append(candidate_data)

            except Exception as e:
                errors.append(f"{candidate_row.email}: {str(e)}")

        # Bulk import
        result = service.bulk_add_candidates(
            campaign_id=campaign_id,
            org_id=ctx.org_id,
            candidates=candidates_to_import,
            created_by=ctx.user_id,
        )

        result["errors"].extend(errors)

        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error importing candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Campaign Pipeline Endpoints
# ============================================================================


@router.get("/{campaign_id}/pipeline/board", summary="Get campaign pipeline board")
async def get_campaign_pipeline_board(
    campaign_id: str,
    job_id: Optional[str] = Query(None, description="Filter by job description ID"),
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    """Get pipeline board (Kanban view) for a campaign"""
    try:
        from app.services.pipeline_service import get_pipeline_service

        service = get_campaign_service()
        pipeline_service = get_pipeline_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        # Get pipeline board filtered by campaign_id
        if job_id:
            board = pipeline_service.get_pipeline_board(
                job_id=job_id,
                user_id=ctx.user_id,
                org_id=ctx.org_id,
                campaign_id=campaign_id,
            )
        else:
            # If no job_id, get all candidates in this campaign grouped by stage
            from app.db.supabase_client import get_supabase

            supabase = get_supabase()

            result = (
                supabase.table("pipeline_candidates")
                .select("*")
                .eq("campaign_id", campaign_id)
                .eq("org_id", ctx.org_id)
                .is_("deleted_at", "null")
                .order("created_at", desc=False)
                .execute()
            )

            candidates = result.data or []

            board = {
                "resume_screening": [],
                "technical_assessment": [],
                "voice_screening": [],
                "completed": [],
            }

            for c in candidates:
                stage = c.get("current_stage", "resume_screening")
                if stage in board:
                    board[stage].append(c)

        return board

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching campaign pipeline board: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{campaign_id}/pipeline/advance", summary="Advance candidates to next stage"
)
async def advance_campaign_candidates(
    campaign_id: str,
    data: dict,
    ctx: OrgContext = Depends(require_permission("interview:update")),
):
    """Advance selected candidates to a target stage"""
    try:
        from app.services.pipeline_service import get_pipeline_service

        service = get_campaign_service()
        pipeline_service = get_pipeline_service()

        # Verify campaign belongs to org
        campaign = service.get_campaign(campaign_id, ctx.org_id)

        # Get job_id from first candidate (all should have same job for bulk advance)
        from app.db.supabase_client import get_supabase

        supabase = get_supabase()

        first_candidate = (
            supabase.table("pipeline_candidates")
            .select("job_id")
            .eq("id", data["candidate_ids"][0])
            .execute()
        )

        if not first_candidate.data:
            raise ValueError("Candidate not found")

        job_id = first_candidate.data[0]["job_id"]

        # Advance candidates
        result = pipeline_service.advance_candidates(
            job_id=job_id,
            candidate_ids=data["candidate_ids"],
            target_stage=data["target_stage"],
            user_id=ctx.user_id,
            interview_id=data.get("interview_id"),
            campaign_id=campaign_id,
            org_id=ctx.org_id,
        )

        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error advancing campaign candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{campaign_id}/candidates/{candidate_id}/decision",
    summary="Set candidate decision",
)
async def set_campaign_candidate_decision(
    campaign_id: str,
    candidate_id: str,
    data: dict,
    ctx: OrgContext = Depends(require_permission("interview:update")),
):
    """Set hiring decision for a candidate"""
    try:
        from app.services.pipeline_service import get_pipeline_service

        service = get_campaign_service()
        pipeline_service = get_pipeline_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        # Set decision
        result = pipeline_service.set_decision(
            candidate_id=candidate_id,
            user_id=ctx.user_id,
            decision=data["decision"],
            notes=data.get("notes"),
            org_id=ctx.org_id,
            campaign_id=campaign_id,
        )

        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error setting candidate decision: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete(
    "/{campaign_id}/candidates/{candidate_id}", summary="Delete candidate from campaign"
)
async def delete_campaign_candidate(
    campaign_id: str,
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission("interview:delete")),
):
    """Remove a candidate from the campaign pipeline"""
    try:
        from app.services.pipeline_service import get_pipeline_service

        service = get_campaign_service()
        pipeline_service = get_pipeline_service()

        # Verify campaign belongs to org
        service.get_campaign(campaign_id, ctx.org_id)

        # Delete candidate
        success = pipeline_service.delete_pipeline_candidate(
            candidate_id=candidate_id, user_id=ctx.user_id, org_id=ctx.org_id
        )

        if not success:
            raise ValueError("Failed to delete candidate")

        return {"message": "Candidate removed successfully"}

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting campaign candidate: {e}")
        raise HTTPException(status_code=500, detail=str(e))
