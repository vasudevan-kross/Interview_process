"""Pydantic schemas for organization management."""

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class OrganizationCreate(BaseModel):
    name: str
    slug: Optional[str] = None  # auto-generated if not provided


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    settings: Optional[dict] = None
    allow_domain_join: Optional[bool] = None
    auto_join_domains: Optional[List[str]] = None
    auto_join_role: Optional[str] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    plan: str = "free"
    settings: dict = {}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str = "viewer"  # admin | hr | interviewer | viewer


class UpdateMemberRoleRequest(BaseModel):
    role: str  # admin | hr | interviewer | viewer


class MemberResponse(BaseModel):
    id: str
    user_id: str
    role: str
    joined_at: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class InvitationResponse(BaseModel):
    id: str
    email: str
    role: str
    token: str
    expires_at: str
    accepted_at: Optional[str] = None
    created_at: Optional[str] = None
