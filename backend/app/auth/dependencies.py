"""Authentication dependencies for FastAPI routes."""

from dataclasses import dataclass
from fastapi import Depends, HTTPException, status, Header
from typing import Optional
import logging
from app.config import settings
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# System user UUID for development


@dataclass
class OrgContext:
    """Organization context resolved from JWT + org membership."""
    user_id: str    # internal users.id
    org_id: str     # organizations.id
    role: str       # owner | admin | hr | interviewer | viewer


async def get_current_user_id(
    authorization: Optional[str] = Header(None)
) -> str:
    """
    Extract user ID from Supabase JWT token.

    If no authorization header is provided and DEBUG mode is enabled,
    returns system user UUID. Otherwise, validates JWT using Supabase.

    Args:
        authorization: Bearer token from Authorization header

    Returns:
        User ID (UUID string)

    Raises:
        HTTPException: If token is invalid
    """

    # No authorization header provided
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required"
        )

    # Authorization header provided - validate it
    try:
        # Extract token from "Bearer <token>"
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format"
            )

        token = authorization.split(" ")[1]

        # Use Supabase client to validate the JWT token
        # Supabase client handles JWT verification internally
        client = get_supabase()

        # Get user from JWT token
        response = client.auth.get_user(token)

        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )

        # Return the user ID
        return response.user.id

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )


async def get_optional_user_id(
    authorization: Optional[str] = Header(None)
) -> Optional[str]:
    """
    Optional authentication - returns None if no valid token.
    Used for public endpoints that can optionally use auth.
    """
    try:
        return await get_current_user_id(authorization)
    except HTTPException:
        return None


async def get_current_user(
    authorization: Optional[str] = Header(None)
) -> dict:
    """
    Get current user as a dict with 'id' key.
    Used by endpoints that need current_user["id"].
    """
    user_id = await get_current_user_id(authorization)
    return {"id": user_id}


async def get_current_org_context(
    authorization: Optional[str] = Header(None)
) -> OrgContext:
    """
    Resolve JWT → user_id → org membership → OrgContext.

    Returns the user's organization context including their role.
    For users with multiple orgs, returns the first (primary) org.
    """
    auth_user_id = await get_current_user_id(authorization)
    client = get_supabase()

    # Resolve auth user ID to internal users table ID
    from app.services.user_service import get_user_service
    user_service = get_user_service()
    db_user_id = user_service.resolve_user_id(auth_user_id)

    # Query org membership
    result = client.table("organization_members").select(
        "org_id, role"
    ).eq("user_id", db_user_id).execute()

    if not result.data:
        # Auto-create a personal org (new users or users who predate multi-tenancy)
        from app.services.organization_service import get_organization_service
        try:
            # Get user data from database
            user_rows = client.table("users").select("full_name, email, auth_user_id").eq("id", db_user_id).execute()
            user_data = user_rows.data[0] if user_rows.data else {}

            # Try to get custom org name from Supabase Auth user_metadata
            org_name = None
            try:
                auth_response = client.auth.admin.get_user_by_id(user_data.get("auth_user_id") or auth_user_id)
                if auth_response and auth_response.user and auth_response.user.user_metadata:
                    org_name = auth_response.user.user_metadata.get("org_name")
            except Exception as meta_error:
                logger.debug(f"Could not fetch user metadata: {meta_error}")

            # Fallback to auto-generated name if no custom org name provided
            if not org_name:
                name = user_data.get("full_name") or (user_data.get("email", "").split("@")[0]) or "My"
                org_name = f"{name}'s Workspace"

            org_service = get_organization_service()
            org_service.create_organization(org_name, db_user_id)
            # Re-query membership
            result = client.table("organization_members").select("org_id, role").eq("user_id", db_user_id).execute()
        except Exception as e:
            logger.error(f"Failed to auto-create org for user {db_user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not a member of any organization"
            )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of any organization"
        )

    # Use first org (primary) — future: support org switching
    membership = result.data[0]
    ctx = OrgContext(
        user_id=db_user_id,
        org_id=membership["org_id"],
        role=membership["role"]
    )

    return ctx
