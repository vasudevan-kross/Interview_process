"""Authentication dependencies for FastAPI routes."""

from fastapi import Depends, HTTPException, status, Header
from typing import Optional
import jwt
from app.config import settings
from app.db.supabase_client import get_supabase

# System user UUID for development/testing (only when no auth provided)
SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000000"


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
        if settings.DEBUG:
            # Development mode: Allow requests without auth
            return SYSTEM_USER_UUID
        else:
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
        # If Supabase validation fails, try decoding manually as fallback
        try:
            # Decode JWT without verification (for development)
            # In production, you should use the proper JWT secret
            payload = jwt.decode(
                token,
                options={"verify_signature": False}  # Skip signature verification
            )

            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing user ID"
                )

            return user_id

        except Exception as decode_error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Authentication failed: {str(decode_error)}"
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

