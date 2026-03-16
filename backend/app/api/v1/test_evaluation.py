"""
API endpoints for test evaluation functionality.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Body, Depends, Request
from typing import Optional, List
import logging
from pathlib import Path
from pydantic import BaseModel

from app.config import settings
from app.core.limiter import limiter

from app.schemas.test_evaluation import (
    QuestionPaperResponse,
    AnswerSheetResponse,
    TestResultsResponse,
    TestStatistics,
    TestDetail,
    QuestionDetail,
    EvaluationDetailResponse,
    TestResultSchema,
    ErrorResponse
)


class DeleteAnswerSheetsRequest(BaseModel):
    answer_sheet_ids: List[str]


from app.services.test_evaluation import get_test_evaluation_service
from app.db.supabase_client import get_supabase
from app.auth.dependencies import get_current_org_context, OrgContext
from app.auth.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/test-evaluation", tags=["Test Evaluation"])


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
    "/question-paper",
    response_model=QuestionPaperResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and process a question paper"
)
@limiter.limit("30/minute")
async def upload_question_paper(
    request: Request,
    file: UploadFile = File(..., description="Question paper file (PDF, DOCX, TXT, images)"),
    test_title: str = Form(..., description="Test title"),
    test_type: str = Form(..., description="Test type (development, testing, devops, etc.)"),
    total_marks: float = Form(..., gt=0, description="Total marks for the test"),
    duration_minutes: Optional[int] = Form(None, description="Test duration in minutes"),
    model: Optional[str] = Form(None, description="LLM model to use"),
    ctx: OrgContext = Depends(require_permission('test:create'))
):
    """
    Upload and process a question paper.

    This endpoint:
    - Extracts text from the uploaded file
    - Parses questions using LLM
    - Stores questions in the database
    - Returns structured question data
    """
    try:
        service = get_test_evaluation_service()

        # Read file data
        file_data = await file.read()
        _validate_upload(file_data, file.filename)

        # Process question paper
        result = await service.process_question_paper(
            file_data=file_data,
            filename=file.filename,
            user_id=ctx.user_id,
            test_title=test_title,
            test_type=test_type,
            total_marks=total_marks,
            duration_minutes=duration_minutes,
            model=model,
            org_id=ctx.org_id
        )

        return QuestionPaperResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing question paper: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process question paper"
        )


@router.post(
    "/answer-sheet",
    response_model=AnswerSheetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and evaluate an answer sheet"
)
@limiter.limit("30/minute")
async def upload_answer_sheet(
    request: Request,
    file: UploadFile = File(..., description="Answer sheet file (PDF, DOCX, TXT, images)"),
    test_id: str = Form(..., description="Test ID"),
    candidate_name: str = Form(..., description="Candidate name"),
    candidate_email: Optional[str] = Form(None, description="Candidate email"),
    model: Optional[str] = Form(None, description="LLM model to use"),
    ctx: OrgContext = Depends(require_permission('test:create'))
):
    """
    Upload and evaluate an answer sheet.

    This endpoint:
    - Extracts text from the uploaded answer sheet
    - Parses candidate answers
    - Evaluates each answer using LLM with partial credit
    - Stores evaluations in the database
    - Returns detailed results with feedback
    """
    try:
        service = get_test_evaluation_service()

        # Read file data
        file_data = await file.read()
        _validate_upload(file_data, file.filename)

        # Process answer sheet
        result = await service.process_answer_sheet(
            file_data=file_data,
            filename=file.filename,
            test_id=test_id,
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            user_id=ctx.user_id,
            model=model,
            org_id=ctx.org_id
        )

        return AnswerSheetResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing answer sheet: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process answer sheet"
        )


@router.get(
    "/test/{test_id}/results",
    response_model=TestResultsResponse,
    summary="Get all results for a test"
)
async def get_test_results(
    test_id: str,
    limit: int = 100,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """
    Get all results for a test, ranked by score.

    Returns list of answer sheets with scores, sorted by percentage (highest first).
    """
    try:
        client = get_supabase()
        # Verify test belongs to org
        test_check = client.table("tests").select("id").eq("id", test_id).eq("org_id", ctx.org_id).single().execute()
        if not test_check.data:
            raise HTTPException(status_code=404, detail="Test not found")

        service = get_test_evaluation_service()
        results = await service.get_test_results(test_id=test_id, limit=limit)

        return TestResultsResponse(
            test_id=test_id,
            results=[TestResultSchema(**r) for r in results],
            total=len(results)
        )

    except Exception as e:
        logger.error(f"Error getting test results: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get test results"
        )


@router.get(
    "/test/{test_id}/statistics",
    response_model=TestStatistics,
    summary="Get statistics for a test"
)
async def get_test_statistics(
    test_id: str,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """
    Get statistics for a test.

    Returns:
    - Total submissions
    - Average, highest, and lowest scores
    - Pass rate (based on 40% threshold)
    - Count of passed/failed candidates
    """
    try:
        client = get_supabase()
        # Verify test belongs to org
        test_check = client.table("tests").select("id").eq("id", test_id).eq("org_id", ctx.org_id).single().execute()
        if not test_check.data:
            raise HTTPException(status_code=404, detail="Test not found")

        service = get_test_evaluation_service()
        stats = await service.get_test_statistics(test_id=test_id)

        return TestStatistics(
            test_id=test_id,
            **stats
        )

    except Exception as e:
        logger.error(f"Error getting test statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get test statistics"
        )


@router.get(
    "/test/{test_id}",
    response_model=TestDetail,
    summary="Get test details"
)
async def get_test_details(
    test_id: str,
    include_questions: bool = True,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """
    Get detailed information about a test.

    Optionally includes all questions with answers.
    """
    try:
        client = get_supabase()

        # Get test details
        test_result = client.table("tests").select("*").eq("id", test_id).eq("org_id", ctx.org_id).single().execute()

        if not test_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")

        test_data = test_result.data

        # Get questions if requested
        questions = None
        if include_questions:
            questions_result = client.table("questions").select(
                "*"
            ).eq("test_id", test_id).order("question_number").execute()

            if questions_result.data:
                questions = [QuestionDetail(**q) for q in questions_result.data]

        return TestDetail(
            **test_data,
            questions=questions
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting test details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get test details"
        )


@router.get(
    "/answer-sheet/{answer_sheet_id}",
    response_model=EvaluationDetailResponse,
    summary="Get detailed evaluation for an answer sheet"
)
async def get_answer_sheet_evaluation(
    answer_sheet_id: str,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """
    Get detailed evaluation for a specific answer sheet.

    Returns:
    - Answer sheet information
    - Individual question evaluations with feedback
    - Marks breakdown
    """
    try:
        client = get_supabase()

        # Get answer sheet details (verify org via test)
        sheet_result = client.table("answer_sheets").select(
            "*, tests(org_id)"
        ).eq("id", answer_sheet_id).single().execute()

        if not sheet_result.data or sheet_result.data.get('tests', {}).get('org_id') != ctx.org_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer sheet not found")

        if not sheet_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer sheet not found")

        sheet_data = sheet_result.data

        # Get test details for test title
        test_result = client.table("tests").select("title").eq("id", sheet_data['test_id']).single().execute()
        test_title = test_result.data.get('title', 'Unknown Test') if test_result.data else 'Unknown Test'

        # Get evaluations
        eval_result = client.table("answer_evaluations").select(
            "*, questions(*)"
        ).eq("answer_sheet_id", answer_sheet_id).execute()

        evaluations = eval_result.data if eval_result.data else []

        # Format evaluations
        formatted_evaluations = []
        for eval_item in evaluations:
            question = eval_item.get('questions', {})
            formatted_evaluations.append({
                "id": eval_item.get('id'),
                "question_id": eval_item.get('question_id'),
                "question_number": question.get('question_number'),
                "question_text": question.get('question_text'),
                "candidate_answer": eval_item.get('candidate_answer'),
                "marks_awarded": eval_item.get('marks_awarded', 0),
                "max_marks": question.get('marks', 0),
                "feedback": eval_item.get('feedback'),
                "is_correct": eval_item.get('is_correct'),
                "similarity_score": eval_item.get('similarity_score'),
                "key_points_covered": eval_item.get('key_points_covered', []),
                "key_points_missed": eval_item.get('key_points_missed', [])
            })

        return EvaluationDetailResponse(
            answer_sheet_id=sheet_data['id'],
            test_id=sheet_data['test_id'],
            test_title=test_title,
            candidate_name=sheet_data['candidate_name'],
            candidate_email=sheet_data.get('candidate_email'),
            candidate_id=sheet_data.get('candidate_id'),
            total_marks_obtained=sheet_data.get('total_marks_obtained', 0),
            total_marks=0,  # Will be populated from test data
            percentage=sheet_data.get('percentage', 0),
            status=sheet_data.get('status', 'pending'),
            submitted_at=sheet_data.get('submitted_at'),
            evaluations=formatted_evaluations
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting answer sheet evaluation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get evaluation details"
        )


@router.get(
    "/tests",
    summary="List all tests"
)
async def list_tests(
    test_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """
    List all tests with optional filtering by type.
    """
    try:
        client = get_supabase()

        query = client.table("tests").select("*").eq("org_id", ctx.org_id).is_("deleted_at", "null")

        if test_type:
            query = query.eq("test_type", test_type)

        result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

        return {
            "tests": result.data if result.data else [],
            "total": len(result.data) if result.data else 0
        }

    except Exception as e:
        logger.error(f"Error listing tests: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list tests"
        )


@router.delete(
    "/answer-sheets",
    summary="Delete multiple answer sheets"
)
async def delete_answer_sheets(
    request: DeleteAnswerSheetsRequest = Body(...),
    ctx: OrgContext = Depends(require_permission('test:create'))
):
    """
    Delete multiple answer sheets by their IDs.

    This endpoint:
    - Deletes answer sheet records from the database
    - Removes associated evaluations
    - Deletes uploaded answer sheet files from storage
    """
    try:
        client = get_supabase()

        # Verify org ownership of all requested sheets
        if request.answer_sheet_ids:
            check_result = client.table("answer_sheets").select("id, tests(org_id)").in_("id", request.answer_sheet_ids).execute()
            for item in check_result.data:
                if item.get('tests', {}).get('org_id') != ctx.org_id:
                    raise HTTPException(status_code=403, detail="Unauthorized to delete some answer sheets")

        service = get_test_evaluation_service()
        result = await service.delete_answer_sheets(answer_sheet_ids=request.answer_sheet_ids)

        return {
            "message": f"Successfully deleted {result['deleted_count']} answer sheet(s)",
            "deleted_count": result['deleted_count'],
            "failed_ids": result.get('failed_ids', [])
        }

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting answer sheets: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete answer sheets")
