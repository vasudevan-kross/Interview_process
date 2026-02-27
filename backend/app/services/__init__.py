"""Services module for Interview Management System."""

from app.services.storage_service import get_storage_service, StorageService
from app.services.document_processor import get_document_processor, DocumentProcessor
from app.services.llm_orchestrator import get_llm_orchestrator, LLMOrchestrator
from app.services.test_evaluation import get_test_evaluation_service, TestEvaluationService

# LLM-based Resume Matching (No PyTorch required!)
from app.services.resume_matching_llm import get_resume_matching_service_llm
from app.services.resume_parser_llm import get_resume_parser_llm

# Alias for backward compatibility with existing API code
get_resume_matching_service = get_resume_matching_service_llm

RESUME_MATCHING_ENABLED = True

__all__ = [
    "get_storage_service",
    "StorageService",
    "get_document_processor",
    "DocumentProcessor",
    "get_llm_orchestrator",
    "LLMOrchestrator",
    "get_test_evaluation_service",
    "TestEvaluationService",
    "get_resume_matching_service",
    "get_resume_matching_service_llm",
    "get_resume_parser_llm",
    "RESUME_MATCHING_ENABLED",
]
