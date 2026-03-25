"""
API endpoints for resume matching functionality.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, Body, Request
from typing import List, Optional
import logging
from pathlib import Path
from pydantic import BaseModel

from app.config import settings
from app.core.limiter import limiter
from app.schemas.resume_matching import (
    JobDescriptionResponse,
    ResumeResponse,
    BatchResumeResponse,
    RankedCandidatesResponse,
    JobStatistics,
    SkillsExtractionRequest,
    SkillsExtractionResponse,
    MatchScoreRequest,
    MatchScoreResponse,
    ErrorResponse,
    CandidateInfo
)
from app.auth.dependencies import get_current_org_context, OrgContext
from app.auth.permissions import require_permission


class DeleteResumesRequest(BaseModel):
    resume_ids: List[str]
from app.services import get_resume_matching_service, get_llm_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resume-matching", tags=["Resume Matching"])


def _validate_upload(file_data: bytes, filename: str) -> None:
    """Raise HTTPException if file is too large or has a disallowed extension."""
    if len(file_data) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {settings.MAX_UPLOAD_SIZE // 1048576}MB."
        )
    ext = Path(filename).suffix.lower().lstrip('.')
    if ext not in settings.allowed_extensions_list:
        raise HTTPException(
            status_code=400,
            detail=f"File type .{ext} not allowed. Allowed: {', '.join(settings.allowed_extensions_list)}"
        )


@router.post(
    "/job-description",
    response_model=JobDescriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and process a job description"
)
@limiter.limit("20/minute")
async def upload_job_description(
    request: Request,
    file: UploadFile = File(..., description="Job description file (PDF, DOCX, TXT)"),
    title: str = Form(..., description="Job title"),
    department: Optional[str] = Form(None, description="Department name"),
    model: Optional[str] = Form(None, description="LLM model to use"),
    ctx: OrgContext = Depends(require_permission('jd:create'))
):
    """
    Upload and process a job description file.

    This endpoint:
    - Extracts text from the uploaded file
    - Extracts required skills using LLM
    - Generates vector embeddings
    - Stores the job description in the database
    """
    try:
        service = get_resume_matching_service()

        # Read file data
        file_data = await file.read()
        _validate_upload(file_data, file.filename)

        # Process job description
        result = await service.process_job_description(
            file_data=file_data,
            filename=file.filename,
            user_id=ctx.user_id,
            org_id=ctx.org_id,
            title=title,
            department=department,
            model=model
        )

        return JobDescriptionResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing job description: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process job description")


@router.post(
    "/resume",
    response_model=ResumeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and process a single resume"
)
@limiter.limit("20/minute")
async def upload_resume(
    request: Request,
    file: UploadFile = File(..., description="Resume file (PDF, DOCX, TXT, images)"),
    job_id: str = Form(..., description="Job description ID"),
    candidate_name: Optional[str] = Form(None, description="Candidate name"),
    candidate_email: Optional[str] = Form(None, description="Candidate email"),
    model: Optional[str] = Form(None, description="LLM model to use"),
    ctx: OrgContext = Depends(require_permission('resume:upload'))
):
    """
    Upload and process a single resume.

    This endpoint:
    - Extracts text from the uploaded resume
    - Extracts candidate skills using LLM
    - Generates vector embeddings
    - Calculates match score with the job description
    - Stores the resume in the database
    """
    try:
        service = get_resume_matching_service()

        # Read file data
        file_data = await file.read()
        _validate_upload(file_data, file.filename)

        # Process resume
        result = await service.process_resume(
            file_data=file_data,
            filename=file.filename,
            user_id=ctx.user_id,
            org_id=ctx.org_id,
            job_id=job_id,
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            model=model
        )

        return ResumeResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing resume: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process resume")


@router.post(
    "/resumes/batch",
    response_model=BatchResumeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and process multiple resumes"
)
@limiter.limit("10/minute")
async def upload_multiple_resumes(
    request: Request,
    files: List[UploadFile] = File(..., description="Multiple resume files"),
    job_id: str = Form(..., description="Job description ID"),
    model: Optional[str] = Form(None, description="LLM model to use"),
    ctx: OrgContext = Depends(require_permission('resume:upload'))
):
    """
    Upload and process multiple resumes for a job.

    This endpoint processes multiple resumes in batch and returns:
    - Individual results for each resume
    - Failed uploads with error details
    - Top 5 candidates by match score
    - Summary statistics
    """
    try:
        service = get_resume_matching_service()

        # Prepare resume data
        resumes = []
        for file in files:
            file_data = await file.read()
            _validate_upload(file_data, file.filename)
            resumes.append({
                "file_data": file_data,
                "filename": file.filename,
                "candidate_name": None,  # Could be extracted from filename
                "candidate_email": None
            })

        # Process all resumes
        result = await service.process_multiple_resumes(
            resumes=resumes,
            job_id=job_id,
            user_id=ctx.user_id,
            org_id=ctx.org_id,
            model=model
        )

        return BatchResumeResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing multiple resumes: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process resumes")


@router.get(
    "/job/{job_id}/candidates",
    response_model=RankedCandidatesResponse,
    summary="Get ranked candidates for a job"
)
async def get_ranked_candidates(
    job_id: str,
    limit: int = 50,
    ctx: OrgContext = Depends(require_permission('resume:view'))
):
    """
    Get a ranked list of candidates for a specific job.

    Returns candidates sorted by match score (highest first).
    """
    try:
        service = get_resume_matching_service()

        candidates = await service.get_ranked_candidates(job_id=job_id, org_id=ctx.org_id, limit=limit)

        return RankedCandidatesResponse(
            job_id=job_id,
            candidates=[CandidateInfo(**c) for c in candidates],
            total=len(candidates)
        )

    except Exception as e:
        logger.error(f"Error getting ranked candidates: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get candidates")


@router.get(
    "/jobs",
    summary="List all job descriptions"
)
async def list_job_descriptions(
    ctx: OrgContext = Depends(require_permission('resume:view'))
):
    """
    List all job descriptions for the organization.
    """
    try:
        from app.db.supabase_client import get_supabase

        client = get_supabase()
        result = (
            client.table("job_descriptions")
            .select("id, title, department, created_at")
            .eq("org_id", ctx.org_id)
            .order("created_at", desc=True)
            .execute()
        )

        return {"jobs": result.data or []}

    except Exception as e:
        logger.error(f"Error listing job descriptions: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to list job descriptions: {str(e)}")


@router.get(
    "/job/{job_id}",
    summary="Get job description details"
)
async def get_job_description(
    job_id: str,
    ctx: OrgContext = Depends(require_permission('resume:view'))
):
    """
    Get job description details by ID.
    """
    try:
        service = get_resume_matching_service()
        job = await service.get_job_description(job_id=job_id, org_id=ctx.org_id)
        return job

    except Exception as e:
        logger.error(f"Error getting job description: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get job description")


@router.get(
    "/job/{job_id}/statistics",
    response_model=JobStatistics,
    summary="Get statistics for a job"
)
async def get_job_statistics(
    job_id: str,
    ctx: OrgContext = Depends(require_permission('resume:view'))
):
    """
    Get statistics for a job posting.

    Returns:
    - Total number of resumes
    - Average, top, and lowest match scores
    - Score distribution by ranges
    """
    try:
        service = get_resume_matching_service()

        stats = await service.get_job_statistics(job_id=job_id, org_id=ctx.org_id)

        return JobStatistics(
            job_id=job_id,
            **stats
        )

    except Exception as e:
        logger.error(f"Error getting job statistics: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get statistics")


@router.post(
    "/extract-skills",
    response_model=SkillsExtractionResponse,
    summary="Extract skills from text"
)
async def extract_skills(request: SkillsExtractionRequest):
    """
    Extract skills from job description or resume text.

    Returns categorized skills:
    - Technical skills
    - Soft skills
    - Tools and technologies
    - Programming languages
    - Certifications
    """
    try:
        llm = get_llm_orchestrator()

        result = await llm.extract_skills_from_text(
            text=request.text,
            model=request.model
        )

        return SkillsExtractionResponse(**result)

    except Exception as e:
        logger.error(f"Error extracting skills: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to extract skills")


@router.post(
    "/calculate-match",
    response_model=MatchScoreResponse,
    summary="Calculate match score between JD and resume"
)
async def calculate_match_score(request: MatchScoreRequest):
    """
    Calculate match score between a job description and resume.

    Returns:
    - Match score (0-100)
    - Key matching points
    - Missing requirements
    - Detailed reasoning
    """
    try:
        llm = get_llm_orchestrator()

        result = await llm.calculate_match_score(
            job_description=request.job_description,
            resume=request.resume,
            model=request.model
        )

        return MatchScoreResponse(**result)

    except Exception as e:
        logger.error(f"Error calculating match score: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to calculate match score")


@router.get(
    "/models",
    summary="List available LLM models"
)
async def list_models():
    """
    List available Ollama models for processing.
    """
    try:
        llm = get_llm_orchestrator()
        models = await llm.list_available_models()
        return {"models": models}

    except Exception as e:
        logger.error(f"Error listing models: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list models")


@router.delete(
    "/job/{job_id}",
    summary="Delete a job description and all its resumes"
)
async def delete_job_description(
    job_id: str,
    ctx: OrgContext = Depends(require_permission('jd:create'))
):
    """
    Delete a job description by ID.
    All associated resumes are deleted automatically (CASCADE).
    """
    try:
        service = get_resume_matching_service()
        await service.delete_job_description(job_id=job_id, org_id=ctx.org_id)
        return {"message": "Job description and all associated resumes deleted successfully", "job_id": job_id}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting job description: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete job description")


@router.delete(
    "/resumes",
    summary="Delete multiple resumes"
)
async def delete_resumes(
    request: DeleteResumesRequest = Body(...),
    ctx: OrgContext = Depends(require_permission('resume:upload'))
):
    """
    Delete multiple resumes by their IDs.

    This endpoint:
    - Deletes resume records from the database
    - Removes associated vector embeddings
    - Deletes uploaded resume files from storage
    """
    try:
        service = get_resume_matching_service()

        result = await service.delete_resumes(
            resume_ids=request.resume_ids,
            org_id=ctx.org_id
        )

        return {
            "message": f"Successfully deleted {result['deleted_count']} resume(s)",
            "deleted_count": result['deleted_count'],
            "failed_ids": result.get('failed_ids', [])
        }

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting resumes: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete resumes")
