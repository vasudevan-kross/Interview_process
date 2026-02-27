"""API v1 router aggregation."""
from fastapi import APIRouter
from app.api.v1.test_evaluation import router as test_evaluation_router
from app.api.v1.test_evaluation_batch import router as test_evaluation_batch_router
from app.api.v1.common import router as common_router
from app.api.v1.video_interviews import router as video_interviews_router
from app.api.v1.coding_interviews import router as coding_interviews_router

api_router = APIRouter(prefix="/api/v1")

# Include core routers (always available)
api_router.include_router(common_router)
api_router.include_router(test_evaluation_router)
api_router.include_router(test_evaluation_batch_router)
api_router.include_router(video_interviews_router)
api_router.include_router(coding_interviews_router)

# Optional: Resume Matching (requires PyTorch/sentence-transformers)
try:
    from app.api.v1.resume_matching import router as resume_matching_router
    api_router.include_router(resume_matching_router)
    print("✅ Resume Matching API enabled")
except ImportError as e:
    print(f"⚠️  Resume Matching API disabled (PyTorch not installed): {e}")

__all__ = ["api_router"]
