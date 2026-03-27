# pyright: ignore
"""
API routes for Hiring Campaigns
"""

import logging
import io
import csv
from typing import Optional, List, Any, Dict, cast
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse, StreamingResponse

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
from app.services.report_renderer import build_campaign_pdf, build_candidate_pdf
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


def _build_campaign_csv(report: dict) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Candidate Name",
            "Candidate Email",
            "Job Title",
            "Stage",
            "Recommendation",
            "Decision",
            "Resume Score",
            "Coding Score",
            "Voice Status",
            "Slot",
            "Created At",
            "Decided At",
        ]
    )
    for row in report.get("candidates", []):
        writer.writerow(
            [
                row.get("candidate_name", ""),
                row.get("candidate_email", ""),
                row.get("job_title", ""),
                row.get("current_stage", ""),
                row.get("recommendation", ""),
                row.get("final_decision", ""),
                row.get("resume_match_score", ""),
                row.get("coding_score", ""),
                row.get("voice_status", ""),
                row.get("slot_name", ""),
                row.get("created_at", ""),
                row.get("decided_at", ""),
            ]
        )
    return output.getvalue()


def _build_candidate_csv(report: dict) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Name",
            "Email",
            "Job Title",
            "Stage",
            "Recommendation",
            "Decision",
            "Resume Score",
            "Coding Score",
            "Voice Status",
            "Slot",
            "Decision Notes",
            "Resume Summary",
            "Coding Summary",
            "Voice Summary",
        ]
    )
    candidate = report.get("candidate", {})
    resume = report.get("resume") or {}
    coding = report.get("coding") or {}
    voice = report.get("voice") or {}
    writer.writerow(
        [
            candidate.get("name", ""),
            candidate.get("email", ""),
            candidate.get("job_title", ""),
            candidate.get("current_stage", ""),
            candidate.get("recommendation", ""),
            candidate.get("final_decision", ""),
            candidate.get("resume_match_score", ""),
            candidate.get("coding_score", ""),
            candidate.get("voice_status", ""),
            candidate.get("slot_name", ""),
            candidate.get("decision_notes", ""),
            resume.get("summary", ""),
            coding.get("summary", ""),
            voice.get("summary", ""),
        ]
    )
    return output.getvalue()


@router.get("/{campaign_id}/report", summary="Get campaign report")
async def get_campaign_report(
    campaign_id: str, ctx: OrgContext = Depends(require_permission("interview:view"))
):
    try:
        service = get_campaign_service()
        report = service.get_campaign_report(campaign_id, ctx.org_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching campaign report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report")


@router.get("/{campaign_id}/export.csv", summary="Export campaign report CSV")
async def export_campaign_csv(
    campaign_id: str, ctx: OrgContext = Depends(require_permission("interview:view"))
):
    try:
        service = get_campaign_service()
        report = service.get_campaign_report(campaign_id, ctx.org_id)
        csv_data = _build_campaign_csv(report)
        return StreamingResponse(
            io.BytesIO(csv_data.encode("utf-8")),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=campaign_{campaign_id}.csv"
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting campaign CSV: {e}")
        raise HTTPException(status_code=500, detail="Failed to export CSV")


@router.get("/{campaign_id}/export.pdf", summary="Export campaign report PDF")
async def export_campaign_pdf(
    campaign_id: str, ctx: OrgContext = Depends(require_permission("interview:view"))
):
    try:
        service = get_campaign_service()
        report = service.get_campaign_report(campaign_id, ctx.org_id)
        pdf_data = build_campaign_pdf(report)
        return StreamingResponse(
            io.BytesIO(pdf_data),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=campaign_{campaign_id}.pdf"
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting campaign PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to export PDF")


@router.get(
    "/{campaign_id}/candidates/{candidate_id}/report",
    summary="Get candidate report",
)
async def get_candidate_report(
    campaign_id: str,
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_campaign_service()
        report = service.get_candidate_report(campaign_id, candidate_id, ctx.org_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching candidate report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report")


@router.get(
    "/{campaign_id}/candidates/{candidate_id}/export.csv",
    summary="Export candidate report CSV",
)
async def export_candidate_csv(
    campaign_id: str,
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_campaign_service()
        report = service.get_candidate_report(campaign_id, candidate_id, ctx.org_id)
        csv_data = _build_candidate_csv(report)
        return StreamingResponse(
            io.BytesIO(csv_data.encode("utf-8")),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=candidate_{candidate_id}.csv"
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting candidate CSV: {e}")
        raise HTTPException(status_code=500, detail="Failed to export CSV")


@router.get(
    "/{campaign_id}/candidates/{candidate_id}/export.pdf",
    summary="Export candidate report PDF",
)
async def export_candidate_pdf(
    campaign_id: str,
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission("interview:view")),
):
    try:
        service = get_campaign_service()
        report = service.get_candidate_report(campaign_id, candidate_id, ctx.org_id)
        pdf_data = build_candidate_pdf(report)
        return StreamingResponse(
            io.BytesIO(pdf_data),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=candidate_{candidate_id}.pdf"
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting candidate PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to export PDF")


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

        candidates = cast(
            List[Dict[str, Any]], [c for c in candidates if isinstance(c, dict)]
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

        def _cell_to_str(value: object) -> Optional[str]:
            if value is None:
                return None
            return str(value).strip()

        # Verify campaign belongs to org
        campaign = service.get_campaign(campaign_id, ctx.org_id)

        # Read Excel file
        import openpyxl

        contents = await file.read()
        workbook = openpyxl.load_workbook(io.BytesIO(contents))
        sheet = workbook.active
        if not sheet:
            raise ValueError("Invalid Excel file")

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
                    _cell_to_str(row[col_map["email"]])
                    if "email" in col_map and row[col_map["email"]] is not None
                    else None
                )
                name = (
                    _cell_to_str(row[col_map["name"]])
                    if "name" in col_map and row[col_map["name"]] is not None
                    else None
                )

                if not email or not name:
                    errors.append(f"Row {row_idx}: Missing email or name")
                    continue

                candidate = {
                    "email": email,
                    "name": name,
                    "phone": _cell_to_str(row[col_map["phone"]])
                    if "phone" in col_map and row[col_map["phone"]] is not None
                    else None,
                    "job_role": _cell_to_str(row[col_map["job_role"]])
                    if "job_role" in col_map and row[col_map["job_role"]] is not None
                    else None,
                    "slot": _cell_to_str(row[col_map["slot"]])
                    if "slot" in col_map and row[col_map["slot"]] is not None
                    else None,
                    "notes": _cell_to_str(row[col_map["notes"]])
                    if "notes" in col_map and row[col_map["notes"]] is not None
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
        jobs_data = job_results.data if isinstance(job_results.data, list) else []
        available_jobs: dict[str, Any] = {}
        for job in jobs_data:
            if not isinstance(job, dict):
                continue
            title = job.get("title")
            job_id = job.get("id")
            if title:
                available_jobs[str(title)] = job_id

        # Auto-map job roles to job descriptions
        job_mappings = {}
        for candidate in candidates:
            job_role = candidate.get("job_role")
            if isinstance(job_role, str) and job_role and job_role not in job_mappings:
                # Try exact match first
                if job_role in available_jobs:
                    job_mappings[job_role] = available_jobs[job_role]
                else:
                    # Try case-insensitive partial match
                    job_role_lower = job_role.lower()
                    for job_title, job_id in available_jobs.items():
                        if job_role_lower in job_title.lower():
                            job_mappings[job_role] = job_id
                            break
                    if job_role not in job_mappings:
                        job_mappings[job_role] = None  # Unmapped

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
                job_role_key = candidate_row.job_role or ""
                job_id = import_request.job_mappings.get(job_role_key)
                if not job_role_key or not job_id:
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
                if not isinstance(c, dict):
                    continue
                stage = str(c.get("current_stage") or "resume_screening")
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
        first_candidate_data = (
            first_candidate.data if isinstance(first_candidate.data, list) else []
        )

        if not first_candidate_data:
            raise ValueError("Candidate not found")

        job_id = (
            first_candidate_data[0].get("job_id")
            if isinstance(first_candidate_data[0], dict)
            else None
        )
        if not job_id:
            raise ValueError("Candidate missing job_id")
        job_id_str = str(job_id)

        # Advance candidates
        result = pipeline_service.advance_candidates(
            job_id=job_id_str,
            candidate_ids=data["candidate_ids"],
            target_stage=data["target_stage"],
            user_id=ctx.user_id,
            interview_id=data.get("interview_id"),
            campaign_id=data.get("voice_campaign_id"),
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
