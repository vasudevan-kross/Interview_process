"""Role-based permission system for multi-tenant organizations."""

from fastapi import Depends, HTTPException, status
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.auth.dependencies import OrgContext

# Permission map per role
ROLE_PERMISSIONS = {
    'owner': {'*'},
    'admin': {'*'},
    'hr': {
        'jd:create', 'jd:edit', 'jd:view',
        'resume:upload', 'resume:view',
        'interview:create', 'interview:edit', 'interview:evaluate', 'interview:view',
        'campaign:create', 'campaign:edit', 'campaign:view',
        'test:create', 'test:edit', 'test:view',
        'pipeline:manage', 'pipeline:view',
        'settings:view',
    },
    'interviewer': {
        'interview:evaluate', 'interview:view',
        'jd:view', 'resume:view', 'campaign:view', 'test:view',
        'pipeline:view', 'settings:view',
    },
    'viewer': {
        'jd:view', 'resume:view', 'interview:view',
        'campaign:view', 'test:view', 'pipeline:view',
        'settings:view',
    },
}


def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    role_perms = ROLE_PERMISSIONS.get(role, set())
    if '*' in role_perms:
        return True
    if permission in role_perms:
        return True
    # Check wildcard view: '*.view' pattern
    if permission.endswith(':view'):
        view_perm = permission.replace(':view', ':view')
        if view_perm in role_perms:
            return True
    return False


def require_permission(permission: str):
    """Dependency factory that checks if current user's role has the required permission."""
    from app.auth.dependencies import get_current_org_context, OrgContext

    async def checker(ctx: OrgContext = Depends(get_current_org_context)):
        if not has_permission(ctx.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required. Your role '{ctx.role}' does not have this permission."
            )
        return ctx
    return checker


def require_role(*allowed_roles: str):
    """Dependency factory that checks if current user has one of the allowed roles."""
    from app.auth.dependencies import get_current_org_context, OrgContext

    async def checker(ctx: OrgContext = Depends(get_current_org_context)):
        if ctx.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of roles {allowed_roles} required. Your role is '{ctx.role}'."
            )
        return ctx
    return checker
