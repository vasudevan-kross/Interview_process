"""
Batch Test Evaluation API - Handle multiple answer sheets at once
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from typing import List
import uuid
import asyncio
from datetime import datetime
import logging
import hashlib

from app.db.supabase_client import get_supabase
from app.auth.dependencies import get_current_org_context, OrgContext
from app.auth.permissions import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/test-evaluation/batch", tags=["Test Evaluation - Batch"])


# Store batch status in memory (use Redis in production)
batch_status = {}


async def process_single_paper(
    file_data: bytes,
    filename: str,
    test_id: str,
    candidate_name: str,
    batch_id: str,
    user_id: str
):
    """Process a single answer sheet using the same logic as single upload"""
    try:
        from app.services.test_evaluation import get_test_evaluation_service

        service = get_test_evaluation_service()

        # Log file details for debugging with hash to verify uniqueness
        file_hash = hashlib.md5(file_data).hexdigest()[:8]
        logger.info(f"[Batch {batch_id}] Processing {filename} for candidate: {candidate_name}, file size: {len(file_data)} bytes, hash: {file_hash}")

        # Process answer sheet (same as single upload)
        result = await service.process_answer_sheet(
            file_data=file_data,
            filename=filename,
            test_id=test_id,
            candidate_name=candidate_name,
            candidate_email=None,
            user_id=user_id,
            model=None
        )

        logger.info(f"Processed paper: {filename} - Score: {result.get('total_marks_obtained')}/{result.get('total_marks')}")

        return {
            "filename": filename,
            "status": "success",
            "score": result.get("total_marks_obtained"),
            "total_marks": result.get("total_marks"),
            "percentage": result.get("percentage"),
            "candidate_name": candidate_name,
            "answer_sheet_id": result.get("answer_sheet_id")
        }

    except Exception as e:
        logger.error(f"Error processing {filename}: {e}")
        return {
            "filename": filename,
            "status": "error",
            "error": str(e)
        }


async def process_batch(
    batch_id: str,
    files_data: List[tuple],
    test_id: str,
    user_id: str
):
    """Process all papers in background"""
    try:
        batch_status[batch_id] = {
            "status": "processing",
            "total": len(files_data),
            "processed": 0,
            "results": []
        }

        # Process papers concurrently (limit to 5 at a time)
        semaphore = asyncio.Semaphore(5)

        async def process_with_semaphore(file_info):
            async with semaphore:
                result = await process_single_paper(
                    file_data=file_info[0],
                    filename=file_info[1],
                    test_id=test_id,
                    candidate_name=file_info[2],
                    batch_id=batch_id,
                    user_id=user_id
                )
                batch_status[batch_id]["processed"] += 1
                batch_status[batch_id]["results"].append(result)
                return result

        # Process all files
        await asyncio.gather(*[
            process_with_semaphore(file_info)
            for file_info in files_data
        ])

        # Mark batch complete
        batch_status[batch_id]["status"] = "completed"
        logger.info(f"Batch {batch_id} completed: {len(files_data)} papers processed")

    except Exception as e:
        logger.error(f"Batch processing error: {e}")
        batch_status[batch_id]["status"] = "error"
        batch_status[batch_id]["error"] = str(e)


@router.post("/upload")
async def batch_upload_papers(
    background_tasks: BackgroundTasks,
    test_id: str = Form(...),
    files: List[UploadFile] = File(...),
    ctx: OrgContext = Depends(require_permission('test:create'))
):
    """
    Upload and process multiple answer sheets at once.

    - **test_id**: Test ID to evaluate against
    - **files**: Multiple answer sheet files (images or PDFs)

    Returns batch_id for tracking progress.
    """
    try:
        # Validate
        if len(files) > 50:
            raise HTTPException(400, "Maximum 50 files per batch")

        if len(files) == 0:
            raise HTTPException(400, "No files provided")

        # Verify test belongs to org
        client = get_supabase()
        test_check = client.table("tests").select("id").eq("id", test_id).eq("org_id", ctx.org_id).single().execute()
        if not test_check.data:
            raise HTTPException(status_code=404, detail="Test not found")

        # Generate batch ID
        batch_id = str(uuid.uuid4())

        # Read all files
        files_data = []
        for i, file in enumerate(files):
            content = await file.read()
            # Extract candidate name from filename
            # Remove extension and replace underscores/hyphens with spaces
            name_without_ext = file.filename.rsplit('.', 1)[0]
            candidate_name = name_without_ext.replace('_', ' ').replace('-', ' ').strip()
            if not candidate_name:
                candidate_name = f"Candidate {i+1}"

            # Log file upload details
            file_hash = hashlib.md5(content).hexdigest()[:8]
            logger.info(f"[Batch {batch_id}] Uploaded file {i+1}/{len(files)}: {file.filename}, candidate: {candidate_name}, size: {len(content)} bytes, hash: {file_hash}")

            files_data.append((content, file.filename, candidate_name))

        # Start background processing
        background_tasks.add_task(
            process_batch,
            batch_id=batch_id,
            files_data=files_data,
            test_id=test_id,
            user_id=ctx.user_id
        )

        return {
            "batch_id": batch_id,
            "total_papers": len(files),
            "status": "processing",
            "message": f"Processing {len(files)} answer sheets. Check progress at /batch/status/{batch_id}"
        }

    except Exception as e:
        logger.error(f"Error in batch upload: {e}")
        raise HTTPException(500, f"Failed to upload batch: {str(e)}")


@router.get("/status/{batch_id}")
async def get_batch_status(
    batch_id: str,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """Get batch processing status and results"""
    if batch_id not in batch_status:
        raise HTTPException(404, "Batch not found")

    status = batch_status[batch_id]

    return {
        "batch_id": batch_id,
        "status": status["status"],
        "total": status["total"],
        "processed": status["processed"],
        "progress_percentage": round((status["processed"] / status["total"]) * 100, 1),
        "results": status.get("results", [])
    }


@router.get("/results/{batch_id}")
async def get_batch_results(
    batch_id: str,
    ctx: OrgContext = Depends(require_permission('test:view'))
):
    """Get detailed results for a batch"""
    if batch_id not in batch_status:
        raise HTTPException(404, "Batch not found")

    status = batch_status[batch_id]

    if status["status"] != "completed":
        raise HTTPException(400, "Batch processing not completed yet")

    # Calculate statistics
    successful = [r for r in status["results"] if r["status"] == "success"]
    failed = [r for r in status["results"] if r["status"] == "error"]

    # Filter out None scores
    scores = [r["score"] for r in successful if "score" in r and r["score"] is not None]
    avg_score = sum(scores) / len(scores) if scores else 0

    return {
        "batch_id": batch_id,
        "total_papers": status["total"],
        "successful": len(successful),
        "failed": len(failed),
        "average_score": round(avg_score, 2),
        "results": status["results"]
    }
