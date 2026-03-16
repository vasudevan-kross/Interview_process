"""Organization API: Manage organizations, members, and invitations."""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_org_context, get_current_user_id, OrgContext
from app.auth.permissions import require_role
from app.services.organization_service import get_organization_service
from app.services.user_service import get_user_service
from app.schemas.organizations import (
    OrganizationCreate,
    OrganizationUpdate,
    InviteMemberRequest,
    UpdateMemberRoleRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations", tags=["Organizations"])


# ── Organization CRUD ─────────────────────────────────────────────────────

@router.post("")
async def create_organization(
    body: OrganizationCreate,
    current_user_id: str = Depends(get_current_user_id),
):
    """Create a new organization. The creator becomes the owner."""
    try:
        user_service = get_user_service()
        db_user_id = user_service.resolve_user_id(current_user_id)
        service = get_organization_service()
        org = service.create_organization(body.name, db_user_id, slug=body.slug)
        return org
    except Exception as e:
        logger.error(f"Failed to create organization: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/current")
async def get_current_organization(
    ctx: OrgContext = Depends(get_current_org_context),
):
    """Get the current user's organization details."""
    service = get_organization_service()
    org = service.get_organization(ctx.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {**org, "current_role": ctx.role}


@router.put("/current")
async def update_current_organization(
    body: OrganizationUpdate,
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Update the current organization (owner/admin only)."""
    try:
        service = get_organization_service()
        return service.update_organization(ctx.org_id, body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Members ───────────────────────────────────────────────────────────────

@router.get("/current/members")
async def list_members(
    ctx: OrgContext = Depends(get_current_org_context),
):
    """List all members of the current organization."""
    service = get_organization_service()
    return service.list_members(ctx.org_id)


@router.post("/current/invite")
async def invite_member(
    body: InviteMemberRequest,
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Invite a user to the organization by email (owner/admin only)."""
    try:
        service = get_organization_service()
        return service.invite_member(ctx.org_id, body.email, body.role, ctx.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/current/invitations")
async def list_invitations(
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """List pending invitations (owner/admin only)."""
    service = get_organization_service()
    return service.get_pending_invitations(ctx.org_id)


@router.delete("/current/invitations/{invitation_id}")
async def cancel_invitation(
    invitation_id: str,
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Cancel a pending invitation (owner/admin only)."""
    service = get_organization_service()
    cancelled = service.cancel_invitation(ctx.org_id, invitation_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return {"cancelled": True}


@router.put("/current/members/{member_user_id}/role")
async def update_member_role(
    member_user_id: str,
    body: UpdateMemberRoleRequest,
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Change a member's role (owner/admin only)."""
    try:
        service = get_organization_service()
        return service.update_member_role(ctx.org_id, member_user_id, body.role, ctx.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/current/members/{member_user_id}")
async def remove_member(
    member_user_id: str,
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Remove a member from the organization (owner/admin only)."""
    try:
        service = get_organization_service()
        service.remove_member(ctx.org_id, member_user_id)
        return {"removed": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Public invitation endpoints ───────────────────────────────────────────

@router.get("/invite/{token}")
async def get_invitation(token: str):
    """Get invitation details by token (public, for accept page)."""
    service = get_organization_service()
    invitation = service.get_invitation_by_token(token)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return invitation


@router.post("/accept-invite/{token}")
async def accept_invitation(
    token: str,
    current_user_id: str = Depends(get_current_user_id),
):
    """Accept an invitation (authenticated user)."""
    try:
        user_service = get_user_service()
        db_user_id = user_service.resolve_user_id(current_user_id)
        service = get_organization_service()
        return service.accept_invitation(token, db_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Join Link ────────────────────────────────────────────────────────────

@router.post("/current/join-link/generate")
async def generate_join_link(
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Generate or regenerate the organization's join link token (owner/admin only)."""
    service = get_organization_service()
    return service.generate_join_link_token(ctx.org_id)


@router.get("/current/join-link")
async def get_join_link_info(
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Get the current join link information (owner/admin only)."""
    service = get_organization_service()
    return service.get_join_link_info(ctx.org_id)


@router.put("/current/join-link/toggle")
async def toggle_join_link(
    enabled: bool,
    ctx: OrgContext = Depends(require_role("owner", "admin")),
):
    """Enable or disable the join link (owner/admin only)."""
    service = get_organization_service()
    return service.toggle_join_link(ctx.org_id, enabled)


@router.post("/join-link/{token}")
async def join_via_link(
    token: str,
    current_user_id: str = Depends(get_current_user_id),
):
    """
    Join an organization using a join link token.

    Public endpoint (requires authentication).
    Automatically assigns the role configured in join_link_role (default: interviewer).
    """
    try:
        user_service = get_user_service()
        db_user_id = user_service.resolve_user_id(current_user_id)
        service = get_organization_service()
        return service.join_via_link(token, db_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Organization Discovery (Domain-based Joining) ─────────────────────────

@router.get("/discoverable")
async def list_discoverable_organizations(email: str | None = None):
    """
    List organizations available for signup based on email domain.

    Public endpoint - no authentication required.
    Used by signup page to show matching orgs.

    Args:
        email: Email address to check for domain matches

    Returns:
        List of organizations where email domain matches auto_join_domains
    """
    service = get_organization_service()
    return service.get_discoverable_organizations(email)


@router.post("/join/{org_id}")
async def join_organization(
    org_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    """
    Join an organization via domain matching (self-service).

    Requires authentication. Validates that user's email domain
    matches org's auto_join_domains configuration.

    Returns:
        {
            "org_id": str,
            "role": str,
            "join_method": "domain_match"
        }
    """
    try:
        user_service = get_user_service()
        db_user_id = user_service.resolve_user_id(current_user_id)
        service = get_organization_service()
        return service.join_organization(org_id, db_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
