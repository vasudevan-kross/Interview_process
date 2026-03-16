"""Global middleware to attach org context to request state."""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)

# Public paths that skip org context resolution
PUBLIC_PATHS = (
    "/api/v1/voice-screening/webhook",
    "/api/v1/voice-screening/public",
    "/api/v1/coding-interviews/public",
    "/api/v1/coding-interviews/start",
    "/api/v1/coding-interviews/submit",
    "/api/v1/coding-interviews/save",
    "/api/v1/coding-interviews/activity",
    "/api/v1/health",
    "/api/v1/organizations/invite/",
    "/api/v1/organizations/accept-invite/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/",
)


class OrgContextMiddleware(BaseHTTPMiddleware):
    """Attach org_id, user_id, and role to request.state for downstream use."""

    async def dispatch(self, request: Request, call_next):
        # Initialize state defaults
        request.state.org_id = None
        request.state.user_id = None
        request.state.role = None

        # Skip for public endpoints
        path = request.url.path
        if any(path.startswith(p) for p in PUBLIC_PATHS):
            return await call_next(request)

        # Try to resolve org context from auth header
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                from app.auth.dependencies import get_current_org_context
                ctx = await get_current_org_context(auth_header)
                request.state.org_id = ctx.org_id
                request.state.user_id = ctx.user_id
                request.state.role = ctx.role
            except Exception:
                pass  # Let route-level dependency handle auth errors

        return await call_next(request)
