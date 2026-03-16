"""API v1 router aggregation."""
from fastapi import APIRouter
from app.api.v1.test_evaluation import router as test_evaluation_router
from app.api.v1.test_evaluation_batch import router as test_evaluation_batch_router
from app.api.v1.common import router as common_router
from app.api.v1.coding_interviews import router as coding_interviews_router
from app.api.v1.voice_screening import router as voice_screening_router
from app.api.v1.pipeline import router as pipeline_router
from app.api.v1.organizations import router as organizations_router

api_router = APIRouter(prefix="/api/v1")

# Include core routers (always available)
api_router.include_router(common_router)
api_router.include_router(test_evaluation_router)
api_router.include_router(test_evaluation_batch_router)
api_router.include_router(coding_interviews_router)
api_router.include_router(voice_screening_router)
api_router.include_router(pipeline_router)
api_router.include_router(organizations_router)

# Optional: Resume Matching (requires PyTorch/sentence-transformers)
try:
    from app.api.v1.resume_matching import router as resume_matching_router
    api_router.include_router(resume_matching_router)
    print("[OK] Resume Matching API enabled")
except ImportError as e:
    print(f"[WARNING] Resume Matching API disabled (PyTorch not installed): {e}")

__all__ = ["api_router"]
