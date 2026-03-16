"""Organization service — CRUD for orgs, members, and invitations."""

import uuid
import re
import logging
from typing import Optional, List
from datetime import datetime, timedelta

from app.db.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)

VALID_MEMBER_ROLES = ("admin", "hr", "interviewer", "viewer")
VALID_ALL_ROLES = ("owner", "admin", "hr", "interviewer", "viewer")


class OrganizationService:

    def __init__(self):
        self.client = get_supabase()

    # ── Organization CRUD ─────────────────────────────────────────────────

    def create_organization(self, name: str, owner_user_id: str, slug: Optional[str] = None) -> dict:
        """Create a new organization and add the creator as owner."""
        if not slug:
            slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            slug = f"{slug}-{uuid.uuid4().hex[:8]}"

        org_result = self.client.table("organizations").insert({
            "name": name,
            "slug": slug,
        }).execute()

        if not org_result.data:
            raise ValueError("Failed to create organization")

        org = org_result.data[0]

        # Add creator as owner
        self.client.table("organization_members").insert({
            "org_id": org["id"],
            "user_id": owner_user_id,
            "role": "owner",
        }).execute()

        return org

    def get_organization(self, org_id: str) -> Optional[dict]:
        """Get organization by ID."""
        result = self.client.table("organizations").select("*").eq("id", org_id).single().execute()
        return result.data if result.data else None

    def update_organization(self, org_id: str, updates: dict) -> dict:
        """Update organization fields."""
        allowed = {"name", "logo_url", "settings", "allow_domain_join", "auto_join_domains", "auto_join_role"}
        filtered = {k: v for k, v in updates.items() if k in allowed and v is not None}
        if not filtered:
            raise ValueError("No valid fields to update")

        filtered["updated_at"] = "now()"
        result = self.client.table("organizations").update(filtered).eq("id", org_id).execute()
        if not result.data:
            raise ValueError("Organization not found")
        return result.data[0]

    # ── Members ───────────────────────────────────────────────────────────

    def list_members(self, org_id: str) -> List[dict]:
        """List all members of an organization with user details."""
        result = self.client.table("organization_members").select(
            "id, org_id, user_id, role, joined_at, users!organization_members_user_id_fkey(full_name, email)"
        ).eq("org_id", org_id).order("joined_at").execute()

        members = []
        for m in (result.data or []):
            user_info = m.get("users") or {}
            members.append({
                "id": m["id"],
                "user_id": m["user_id"],
                "role": m["role"],
                "joined_at": m.get("joined_at"),
                "user_name": user_info.get("full_name"),
                "user_email": user_info.get("email"),
            })
        return members

    def update_member_role(self, org_id: str, target_user_id: str, new_role: str, requester_role: str) -> dict:
        """Change a member's role. Only owner can assign admin; owner role can't be changed."""
        if new_role not in VALID_MEMBER_ROLES:
            raise ValueError(f"Invalid role. Must be one of: {VALID_MEMBER_ROLES}")

        # Get target member
        target = self.client.table("organization_members").select("id, role").eq(
            "org_id", org_id
        ).eq("user_id", target_user_id).single().execute()

        if not target.data:
            raise ValueError("Member not found")

        if target.data["role"] == "owner":
            raise ValueError("Cannot change the owner's role")

        if new_role == "admin" and requester_role != "owner":
            raise ValueError("Only the owner can assign admin role")

        result = self.client.table("organization_members").update(
            {"role": new_role}
        ).eq("org_id", org_id).eq("user_id", target_user_id).execute()

        # Invalidate cache for target user
        return result.data[0] if result.data else {}

    def remove_member(self, org_id: str, target_user_id: str) -> bool:
        """Remove a member from the organization. Owner cannot be removed."""
        # Check role
        target = self.client.table("organization_members").select("role").eq(
            "org_id", org_id
        ).eq("user_id", target_user_id).single().execute()

        if not target.data:
            raise ValueError("Member not found")

        if target.data["role"] == "owner":
            raise ValueError("Cannot remove the organization owner")

        self.client.table("organization_members").delete().eq(
            "org_id", org_id
        ).eq("user_id", target_user_id).execute()

        return True

    # ── Invitations ───────────────────────────────────────────────────────

    def invite_member(self, org_id: str, email: str, role: str, invited_by: str) -> dict:
        """Create an invitation for a new member."""
        if role not in VALID_MEMBER_ROLES:
            raise ValueError(f"Invalid role. Must be one of: {VALID_MEMBER_ROLES}")

        # Check if already a member (by email → user lookup)
        user_result = self.client.table("users").select("id").eq("email", email).execute()
        if user_result.data:
            existing = self.client.table("organization_members").select("id").eq(
                "org_id", org_id
            ).eq("user_id", user_result.data[0]["id"]).execute()
            if existing.data:
                raise ValueError("User is already a member of this organization")

        token = uuid.uuid4().hex
        expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()

        result = self.client.table("organization_invitations").upsert({
            "org_id": org_id,
            "email": email,
            "role": role,
            "token": token,
            "invited_by": invited_by,
            "expires_at": expires_at,
        }, on_conflict="org_id,email").execute()

        if not result.data:
            raise ValueError("Failed to create invitation")

        invitation = result.data[0]

        # Send invitation email
        self._send_invitation_email(email, token, org_id)

        return invitation

    def accept_invitation(self, token: str, user_id: str) -> dict:
        """Accept an invitation by token."""
        result = self.client.table("organization_invitations").select("*").eq(
            "token", token
        ).is_("accepted_at", "null").single().execute()

        if not result.data:
            raise ValueError("Invitation not found or already accepted")

        invitation = result.data

        # Check expiry
        expires_at = datetime.fromisoformat(invitation["expires_at"].replace("Z", "+00:00"))
        if datetime.now(expires_at.tzinfo) > expires_at:
            raise ValueError("Invitation has expired")

        # Add user to org
        self.client.table("organization_members").insert({
            "org_id": invitation["org_id"],
            "user_id": user_id,
            "role": invitation["role"],
            "invited_by": invitation["invited_by"],
        }).execute()

        # Mark invitation as accepted
        self.client.table("organization_invitations").update({
            "accepted_at": "now()"
        }).eq("id", invitation["id"]).execute()

        return {"org_id": invitation["org_id"], "role": invitation["role"]}

    def get_pending_invitations(self, org_id: str) -> List[dict]:
        """List pending invitations for an org."""
        result = self.client.table("organization_invitations").select("*").eq(
            "org_id", org_id
        ).is_("accepted_at", "null").order("created_at", desc=True).execute()
        return result.data or []

    def cancel_invitation(self, org_id: str, invitation_id: str) -> bool:
        """Cancel a pending invitation."""
        result = self.client.table("organization_invitations").delete().eq(
            "id", invitation_id
        ).eq("org_id", org_id).is_("accepted_at", "null").execute()
        return bool(result.data)

    def get_invitation_by_token(self, token: str) -> Optional[dict]:
        """Get invitation details by token (public, for accept page)."""
        result = self.client.table("organization_invitations").select(
            "id, email, role, expires_at, accepted_at, organizations(name, slug)"
        ).eq("token", token).single().execute()
        return result.data if result.data else None

    # ── Helpers ────────────────────────────────────────────────────────────

    def _send_invitation_email(self, email: str, token: str, org_id: str):
        """Send invitation email (best-effort)."""
        try:
            from app.services.email_service import get_email_service
            org = self.get_organization(org_id)
            org_name = org["name"] if org else "an organization"
            invite_url = f"{settings.FRONTEND_URL}/invite/{token}"

            email_service = get_email_service()
            email_service.send_email(
                to_email=email,
                subject=f"You've been invited to join {org_name}",
                html_content=f"""
                <h2>Organization Invitation</h2>
                <p>You've been invited to join <strong>{org_name}</strong> on Interview AI.</p>
                <p><a href="{invite_url}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Accept Invitation</a></p>
                <p>This invitation expires in 7 days.</p>
                <p style="color:#666;font-size:12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
                """,
            )
        except Exception as e:
            logger.warning(f"Failed to send invitation email to {email}: {e}")

    def check_pending_invitation(self, email: str) -> Optional[dict]:
        """Check if there's a pending invitation for this email (used during signup)."""
        result = self.client.table("organization_invitations").select(
            "id, org_id, role, token"
        ).eq("email", email).is_("accepted_at", "null").execute()
        if result.data:
            return result.data[0]
        return None

    # ── Organization Discovery (Domain-based Joining) ──────────────────────

    def get_discoverable_organizations(self, email: Optional[str] = None) -> List[dict]:
        """
        Get organizations available for discovery based on email domain.

        Returns organizations where:
        - allow_domain_join = TRUE
        - User's email domain is in auto_join_domains array

        Args:
            email: Email address to extract domain from

        Returns:
            List of matching orgs with id, name, slug, logo_url, auto_role
        """
        if not email or '@' not in email:
            return []

        domain = email.split('@')[-1].lower()

        # Query orgs with domain matching enabled
        result = self.client.table("organizations").select(
            "id, name, slug, logo_url, auto_join_role, auto_join_domains"
        ).eq("allow_domain_join", True).execute()

        matched_orgs = []
        for org in (result.data or []):
            # Check if user's domain is in the org's whitelist
            auto_join_domains = org.get("auto_join_domains") or []
            if domain in [d.lower() for d in auto_join_domains]:
                matched_orgs.append({
                    "id": org["id"],
                    "name": org["name"],
                    "slug": org["slug"],
                    "logo_url": org.get("logo_url"),
                    "auto_role": org.get("auto_join_role", "viewer"),
                })

        return matched_orgs

    def join_organization(self, org_id: str, user_id: str) -> dict:
        """
        Self-service join to an organization via domain matching.

        Validates:
        1. User email domain matches org's auto_join_domains
        2. User is not already a member
        3. Org has allow_domain_join enabled

        Args:
            org_id: Organization to join
            user_id: Internal user ID

        Returns:
            {
                "org_id": str,
                "role": str,
                "join_method": "domain_match"
            }

        Raises:
            ValueError: If validation fails
        """
        # Get user email
        user_result = self.client.table("users").select("email").eq("id", user_id).single().execute()
        if not user_result.data:
            raise ValueError("User not found")

        email = user_result.data["email"]
        domain = email.split('@')[-1].lower() if '@' in email else None

        if not domain:
            raise ValueError("Invalid email format")

        # Check if already a member
        existing = self.client.table("organization_members").select("id").eq(
            "org_id", org_id
        ).eq("user_id", user_id).execute()

        if existing.data:
            raise ValueError("Already a member of this organization")

        # Get org settings
        org_result = self.client.table("organizations").select(
            "id, name, allow_domain_join, auto_join_domains, auto_join_role"
        ).eq("id", org_id).single().execute()

        if not org_result.data:
            raise ValueError("Organization not found")

        org = org_result.data

        # Validate domain matching
        if not org.get("allow_domain_join"):
            raise ValueError("This organization does not allow domain-based joining")

        auto_join_domains = org.get("auto_join_domains") or []
        if domain not in [d.lower() for d in auto_join_domains]:
            raise ValueError("Your email domain is not authorized to join this organization")

        # Add user to org with configured role
        assigned_role = org.get("auto_join_role", "viewer")

        self.client.table("organization_members").insert({
            "org_id": org_id,
            "user_id": user_id,
            "role": assigned_role,
        }).execute()

        logger.info(f"User {user_id} ({email}) auto-joined org {org_id} via domain {domain} with role {assigned_role}")

        return {
            "org_id": org_id,
            "role": assigned_role,
            "join_method": "domain_match"
        }

    # ── Join Link ─────────────────────────────────────────────────────────

    def generate_join_link_token(self, org_id: str) -> dict:
        """Generate or regenerate the join link token for an organization."""
        # Generate a secure random token (32 hex chars)
        token = uuid.uuid4().hex

        result = self.client.table("organizations").update({
            "join_link_token": token,
            "join_link_enabled": True,
        }).eq("id", org_id).execute()

        if not result.data:
            raise ValueError("Failed to generate join link token")

        return {
            "join_link_token": token,
            "join_link_enabled": True
        }

    def toggle_join_link(self, org_id: str, enabled: bool) -> dict:
        """Enable or disable the join link without changing the token."""
        result = self.client.table("organizations").update({
            "join_link_enabled": enabled
        }).eq("id", org_id).execute()

        if not result.data:
            raise ValueError("Failed to update join link status")

        return result.data[0]

    def get_join_link_info(self, org_id: str) -> dict:
        """Get join link information for an organization."""
        result = self.client.table("organizations").select(
            "join_link_token, join_link_enabled, join_link_role"
        ).eq("id", org_id).single().execute()

        if not result.data:
            raise ValueError("Organization not found")

        return result.data

    def join_via_link(self, token: str, user_id: str) -> dict:
        """Join an organization using a join link token."""
        # Find organization with this token
        org_result = self.client.table("organizations").select(
            "id, name, join_link_enabled, join_link_role"
        ).eq("join_link_token", token).eq("join_link_enabled", True).execute()

        if not org_result.data:
            raise ValueError("Invalid or disabled join link")

        org = org_result.data[0]
        org_id = org["id"]
        role = org.get("join_link_role", "interviewer")

        # Check if already a member
        existing = self.client.table("organization_members").select("role").eq(
            "org_id", org_id
        ).eq("user_id", user_id).execute()

        if existing.data:
            return {
                "org_id": org_id,
                "org_name": org["name"],
                "role": existing.data[0]["role"],
                "already_member": True
            }

        # Add as new member
        self.client.table("organization_members").insert({
            "org_id": org_id,
            "user_id": user_id,
            "role": role,
        }).execute()

        logger.info(f"User {user_id} joined org {org_id} via join link as {role}")

        return {
            "org_id": org_id,
            "org_name": org["name"],
            "role": role,
            "join_method": "join_link"
        }


_instance = None


def get_organization_service() -> OrganizationService:
    global _instance
    if _instance is None:
        _instance = OrganizationService()
    return _instance
