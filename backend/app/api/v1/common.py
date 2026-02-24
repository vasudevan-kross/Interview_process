"""
Common API endpoints shared across features.
"""
from fastapi import APIRouter, HTTPException, status
import logging

from app.services import get_llm_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/common", tags=["Common"])


@router.get(
    "/models",
    summary="List available LLM models from local Ollama"
)
async def list_models():
    """
    List all available Ollama models installed locally.

    This endpoint fetches models directly from the local Ollama instance.
    Used by both Resume Matching and Test Evaluation features.
    """
    try:
        llm = get_llm_orchestrator()
        models = await llm.list_available_models()
        return {"models": models}

    except Exception as e:
        logger.error(f"Error listing Ollama models: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch models from local Ollama: {str(e)}"
        )
