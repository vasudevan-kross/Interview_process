"""FastAPI application entry point."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.config import settings
from app.api.v1 import api_router
from app.middleware.org_context import OrgContextMiddleware
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered interview management system with resume matching and test evaluation",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS - allow all origins in debug mode (for ngrok/dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.DEBUG else settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Org context middleware (attaches org_id to request.state)
app.add_middleware(OrgContextMiddleware)

# Rate limiting middleware
app.add_middleware(SlowAPIMiddleware)

# Include API routers
app.include_router(api_router)


@app.on_event("startup")
async def startup_check():
    """Verify required config is present before accepting requests."""
    required = ['SUPABASE_URL', 'SUPABASE_KEY', 'SECRET_KEY']
    for key in required:
        if not getattr(settings, key, None):
            raise RuntimeError(f"Missing required config: {key}")
    logger.info("Startup check passed — all required config present")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Welcome to Interview Management API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "debug_mode": settings.DEBUG,
        "database": settings.DB_TYPE,
        "vector_db": settings.VECTOR_DB,
        "storage": settings.STORAGE_TYPE
    }


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    if settings.DEBUG:
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "type": type(exc).__name__},
        )
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
