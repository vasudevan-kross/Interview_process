"""API v1 router aggregation."""
from fastapi import APIRouter
from app.api.v1.resume_matching import router as resume_matching_router
from app.api.v1.test_evaluation import router as test_evaluation_router

api_router = APIRouter(prefix="/api/v1")

# Include all v1 routers
api_router.include_router(resume_matching_router)
api_router.include_router(test_evaluation_router)

__all__ = ["api_router"]
