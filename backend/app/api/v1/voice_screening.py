"""
Voice Screening API - Clean, flexible implementation with VAPI integration.

This module provides REST endpoints for:
- Campaign management (with AI prompt generation, knowledge base support)
- Candidate management (minimal schema, dynamic field extraction)
- Call history tracking (with AI summary generation)
- VAPI integration (file upload, webhooks, function calling)
"""

import logging
import secrets
import asyncio
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
import httpx
import pandas as pd
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from app.services.user_service import get_user_service
from postgrest import APIError

from app.db.supabase_client import get_supabase
from app.core.config import get_settings
from app.auth.dependencies import get_current_user, get_current_org_context, OrgContext
from app.auth.permissions import require_permission
from app.schemas.voice_screening import (
    CampaignCreateRequest,
    CampaignResponse,
    VoiceCandidateCreate,
    VoiceCandidateBulkCreate,
    VoiceCandidateUpdate,
    VoiceCandidateResponse,
    CallHistoryResponse,
    QuestionGenerationRequest,
    QuestionGenerationResponse,
    FetchCallDataRequest,
    FetchCallDataResponse,
    VoiceWebhookPayload
)
from app.services.vapi_prompt_generator import VAPIPromptGenerator
from app.services.vapi_config_builder import VAPIConfigBuilder
from app.services.vapi_file_service import get_vapi_file_service
from app.services.interview_summary_service import get_interview_summary_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice-screening", tags=["voice-screening"])


# ============================================================================
# CAMPAIGN ENDPOINTS
# ============================================================================

@router.post("/campaigns", response_model=CampaignResponse)
async def create_campaign(
    request: CampaignCreateRequest,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """
    Create a new voice screening campaign with AI-generated VAPI configuration.

    Generates dynamic system prompts and structured data schemas using Ollama.
    Supports knowledge base file integration.
    """
    try:
        supabase = get_supabase()
        settings = get_settings()

        # Generate system prompt using Ollama
        prompt_generator = VAPIPromptGenerator()
        generated_config = await prompt_generator.generate_system_prompt(
            job_role=request.job_role,
            custom_questions=request.custom_questions,
            required_fields=request.required_fields,
            interview_persona=request.interview_persona.value,
            candidate_type=request.candidate_type.value,
            interview_style=request.interview_style.value,
            job_description_text=request.job_description_text,
            technical_requirements=request.technical_requirements
        )

        # Build VAPI config
        config_builder = VAPIConfigBuilder()
        vapi_config = config_builder.build_vapi_config(
            system_prompt=generated_config["system_prompt"],
            structured_data_schema=generated_config["structured_data_schema"],
            candidate_type=request.candidate_type.value,
            knowledge_base_file_ids=request.knowledge_base_file_ids,
            enable_functions=True,
            interview_style=request.interview_style.value
        )

        # Build default function definitions
        vapi_functions = [
            {
                "name": "end_call",
                "description": "End interview when candidate indicates they're done",
                "parameters": {"type": "object", "properties": {"reason": {"type": "string"}}}
            }
        ]

        # Insert campaign into database
        campaign_data = {
            "created_by": ctx.user_id,
            "org_id": ctx.org_id,
            "name": request.name,
            "job_role": request.job_role,
            "description": request.description,
            "job_description_text": request.job_description_text,
            "technical_requirements": request.technical_requirements,
            "custom_questions": request.custom_questions,
            "required_fields": request.required_fields,
            "interview_persona": request.interview_persona.value,
            "candidate_type": request.candidate_type.value,
            "interview_style": request.interview_style.value,
            "generated_system_prompt": generated_config["system_prompt"],
            "generated_schema": generated_config["structured_data_schema"],
            "vapi_config": vapi_config,
            "knowledge_base_file_ids": request.knowledge_base_file_ids,
            "vapi_functions": vapi_functions,
            "generation_model": "qwen2.5:7b",
            "generation_metadata": {
                "expected_questions": generated_config.get("expected_questions", []),
                "conversation_flow": generated_config.get("conversation_flow", "")
            },
            "is_active": True,
            "job_id": request.job_id
        }

        result = supabase.table("voice_screening_campaigns").insert(campaign_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create campaign")

        campaign = result.data[0]
        logger.info(f"✅ Created campaign: {campaign['id']} ({request.name})")

        return CampaignResponse(**campaign)

    except APIError as e:
        logger.error(f"❌ Database error creating campaign: {e.message}")
        raise HTTPException(status_code=500, detail=f"Database error: {e.message}")
    except Exception as e:
        logger.error(f"❌ Error creating campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns", response_model=List[CampaignResponse])
async def list_campaigns(
    is_active: Optional[bool] = None,
    ctx: OrgContext = Depends(require_permission('campaign:view'))
):
    """List all voice screening campaigns for current org."""
    try:
        supabase = get_supabase()

        query = (supabase.table("voice_screening_campaigns")
            .select("*")
            .eq("org_id", ctx.org_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True))

        if is_active is not None:
            query = query.eq("is_active", is_active)

        result = query.execute()

        return [CampaignResponse(**campaign) for campaign in result.data]

    except Exception as e:
        logger.error(f"❌ Error listing campaigns: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:view'))
):
    """Get campaign details by ID."""
    try:
        supabase = get_supabase()

        result = supabase.table("voice_screening_campaigns") \
            .select("*") \
            .eq("id", campaign_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        return CampaignResponse(**result.data)

    except APIError as e:
        if "PGRST116" in str(e):
            raise HTTPException(status_code=404, detail="Campaign not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error fetching campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    updates: Dict[str, Any],
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Update campaign details. If system prompt is changed, vapi_config is rebuilt."""
    try:
        supabase = get_supabase()

        # Verify org membership and get current data
        existing_result = supabase.table("voice_screening_campaigns") \
            .select("*") \
            .eq("id", campaign_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not existing_result.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        existing_campaign = existing_result.data

        # If generated_system_prompt is being updated, rebuild vapi_config
        if "generated_system_prompt" in updates and updates["generated_system_prompt"] != existing_campaign.get("generated_system_prompt"):
            logger.info(f"System prompt changed, rebuilding vapi_config for campaign {campaign_id}")

            # Get the structured data schema from the campaign
            generated_schema = existing_campaign.get("generated_schema", {})

            # Rebuild vapi_config with the new system prompt
            config_builder = VAPIConfigBuilder()
            new_vapi_config = config_builder.build_vapi_config(
                system_prompt=updates["generated_system_prompt"],
                structured_data_schema=generated_schema,
                candidate_type=existing_campaign.get("candidate_type", "general"),
                knowledge_base_file_ids=existing_campaign.get("knowledge_base_file_ids", []),
                enable_functions=True,
                interview_style=existing_campaign.get("interview_style", "conversational")
            )

            # Add the updated vapi_config to updates
            updates["vapi_config"] = new_vapi_config
            logger.info(f"✅ Rebuilt vapi_config with updated system prompt")

        # Update
        result = supabase.table("voice_screening_campaigns") \
            .update(updates) \
            .eq("id", campaign_id) \
            .execute()

        return CampaignResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Delete campaign (cascades to candidates and call history)."""
    try:
        supabase = get_supabase()

        result = supabase.table("voice_screening_campaigns") \
            .update({"deleted_at": datetime.utcnow().isoformat()}) \
            .eq("id", campaign_id) \
            .eq("org_id", ctx.org_id) \
            .is_("deleted_at", "null") \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        logger.info(f"✅ Soft-deleted campaign: {campaign_id}")
        return {"message": "Campaign deleted successfully"}

    except Exception as e:
        logger.error(f"❌ Error deleting campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CANDIDATE ENDPOINTS
# ============================================================================

@router.post("/candidates", response_model=VoiceCandidateResponse)
async def create_candidate(
    request: VoiceCandidateCreate,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Create a single voice screening candidate."""
    try:
        supabase = get_supabase()

        # Verify campaign exists and belongs to org
        campaign_check = supabase.table("voice_screening_campaigns") \
            .select("id") \
            .eq("id", request.campaign_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not campaign_check.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        # Generate unique interview token (12 chars)
        interview_token = uuid.uuid4().hex[:12]

        # Insert candidate
        candidate_data = {
            "created_by": ctx.user_id,
            "org_id": ctx.org_id,
            "campaign_id": request.campaign_id,
            "interview_token": interview_token,
            "name": request.name,
            "email": request.email,
            "phone": request.phone,
            "status": "pending"
        }

        result = supabase.table("voice_candidates").insert(candidate_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create candidate")

        candidate = result.data[0]
        logger.info(f"✅ Created candidate: {candidate['id']} ({request.name})")

        return VoiceCandidateResponse(**candidate)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error creating candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidates/bulk", response_model=List[VoiceCandidateResponse])
async def bulk_create_candidates(
    request: VoiceCandidateBulkCreate,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Bulk create candidates for a campaign."""
    try:
        supabase = get_supabase()

        # Verify campaign
        campaign_check = supabase.table("voice_screening_campaigns") \
            .select("id") \
            .eq("id", request.campaign_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not campaign_check.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        # Prepare candidate data
        candidates_data = []
        for candidate in request.candidates:
            candidates_data.append({
                "created_by": ctx.user_id,
                "org_id": ctx.org_id,
                "campaign_id": request.campaign_id,
                "interview_token": uuid.uuid4().hex[:12],
                "name": candidate.get("name", ""),
                "email": candidate.get("email"),
                "phone": candidate.get("phone"),
                "status": "pending"
            })

        # Bulk insert
        result = supabase.table("voice_candidates").insert(candidates_data).execute()

        logger.info(f"✅ Created {len(result.data)} candidates for campaign {request.campaign_id}")

        return [VoiceCandidateResponse(**c) for c in result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error bulk creating candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidates/upload")
async def upload_candidates_file(
    campaign_id: str,
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Upload CSV/Excel file to bulk create candidates."""
    try:
        # Verify campaign
        supabase = get_supabase()
        campaign_check = supabase.table("voice_screening_campaigns") \
            .select("id") \
            .eq("id", campaign_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not campaign_check.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        # Read file
        content = await file.read()

        # Parse based on file type
        if file.filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only CSV and Excel files supported")

        # Validate required columns
        if "name" not in df.columns:
            raise HTTPException(status_code=400, detail="CSV must have 'name' column")

        # Prepare candidate data
        candidates_data = []
        for _, row in df.iterrows():
            candidates_data.append({
                "created_by": ctx.user_id,
                "org_id": ctx.org_id,
                "campaign_id": campaign_id,
                "interview_token": uuid.uuid4().hex[:12],
                "name": str(row.get("name", "")),
                "email": str(row.get("email", "")) if pd.notna(row.get("email")) else None,
                "phone": str(row.get("phone", "")) if pd.notna(row.get("phone")) else None,
                "status": "pending"
            })

        # Bulk insert
        result = supabase.table("voice_candidates").insert(candidates_data).execute()

        logger.info(f"✅ Uploaded {len(result.data)} candidates from file")

        return {
            "message": f"Successfully uploaded {len(result.data)} candidates",
            "count": len(result.data)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidates", response_model=List[VoiceCandidateResponse])
async def list_candidates(
    campaign_id: Optional[str] = None,
    status: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission('campaign:view'))
):
    """List all candidates for current org with campaign name."""
    try:
        supabase = get_supabase()

        # Select with campaign name join
        query = supabase.table("voice_candidates") \
            .select("*, voice_screening_campaigns(name)") \
            .eq("org_id", ctx.org_id) \
            .order("created_at", desc=True)

        if campaign_id:
            query = query.eq("campaign_id", campaign_id)

        if status:
            query = query.eq("status", status)

        result = query.execute()

        # Add campaign_name to each candidate
        candidates_with_campaign = []
        for candidate in result.data:
            candidate_dict = dict(candidate)
            # Extract campaign name from nested object
            if candidate.get("voice_screening_campaigns"):
                candidate_dict["campaign_name"] = candidate["voice_screening_campaigns"].get("name")
            # Remove nested object
            candidate_dict.pop("voice_screening_campaigns", None)
            candidates_with_campaign.append(VoiceCandidateResponse(**candidate_dict))

        return candidates_with_campaign

    except Exception as e:
        logger.error(f"❌ Error listing candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidates/token/{token}", response_model=VoiceCandidateResponse)
async def get_candidate_by_token(token: str):
    """Get candidate by interview token (public endpoint for interview page)."""
    try:
        supabase = get_supabase()

        # Fetch candidate
        result = supabase.table("voice_candidates") \
            .select("*") \
            .eq("interview_token", token) \
            .single() \
            .execute()

        # FALLBACK: Partial match for legacy links if exact match fails
        if not result.data:
            logger.info(f"Exact match failed for token {token[:10]}... trying partial match")
            fallback_result = supabase.table("voice_candidates") \
                .select("*") \
                .like("interview_token", f"{token}%") \
                .execute()
            
            if fallback_result.data and len(fallback_result.data) == 1:
                result = type('obj', (object,), {'data': fallback_result.data[0]})
                logger.info(f"✅ Found candidate via fallback partial match: {result.data['id']}")

        if not result.data:
            raise HTTPException(status_code=404, detail="Interview not found")

        candidate = result.data

        # Fetch campaign vapi_config if candidate has campaign_id
        vapi_config = None
        if candidate.get("campaign_id"):
            try:
                campaign_response = supabase.table("voice_screening_campaigns") \
                    .select("vapi_config") \
                    .eq("id", candidate["campaign_id"]) \
                    .single() \
                    .execute()

                if campaign_response.data and campaign_response.data.get("vapi_config"):
                    vapi_config = campaign_response.data["vapi_config"]
                    logger.info(f"✅ Fetched vapi_config for campaign {candidate['campaign_id']}")
            except Exception as campaign_err:
                logger.warning(f"⚠️ Failed to fetch campaign config: {campaign_err}")
                # Continue with vapi_config = None (fallback to static assistant)

        return VoiceCandidateResponse(
            **candidate,
            vapi_config=vapi_config
        )

    except APIError as e:
        if "PGRST116" in str(e):
            raise HTTPException(status_code=404, detail="Interview not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Error fetching candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidates/{candidate_id}", response_model=VoiceCandidateResponse)
async def get_candidate(
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:view'))
):
    """Get candidate details."""
    try:
        supabase = get_supabase()

        result = supabase.table("voice_candidates") \
            .select("*") \
            .eq("id", candidate_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        return VoiceCandidateResponse(**result.data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/candidates/{candidate_id}", response_model=VoiceCandidateResponse)
async def update_candidate(
    candidate_id: str,
    updates: VoiceCandidateUpdate,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Update candidate details (name, email, phone)."""
    try:
        supabase = get_supabase()

        # Verify org membership
        existing = supabase.table("voice_candidates") \
            .select("id, status") \
            .eq("id", candidate_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Prepare update data (only non-None fields)
        update_data = {}
        if updates.name is not None:
            update_data["name"] = updates.name
        if updates.email is not None:
            update_data["email"] = updates.email
        if updates.phone is not None:
            update_data["phone"] = updates.phone

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Update
        result = supabase.table("voice_candidates") \
            .update(update_data) \
            .eq("id", candidate_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update candidate")

        logger.info(f"✅ Updated candidate: {candidate_id}")
        return VoiceCandidateResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Delete candidate (cascades to call history)."""
    try:
        supabase = get_supabase()

        result = supabase.table("voice_candidates") \
            .delete() \
            .eq("id", candidate_id) \
            .eq("org_id", ctx.org_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        logger.info(f"✅ Deleted candidate: {candidate_id}")
        return {"message": "Candidate deleted successfully"}

    except Exception as e:
        logger.error(f"❌ Error deleting candidate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CALL MANAGEMENT ENDPOINTS (Public)
# ============================================================================

@router.post("/candidates/token/{token}/start-call", summary="Mark call started (public)")
async def start_call(token: str, call_id: Optional[str] = None):
    """Mark a candidate's call as in progress and store the VAPI call_id."""
    try:
        supabase = get_supabase()

        # Find candidate by token
        result = supabase.table("voice_candidates") \
            .select("id") \
            .eq("interview_token", token) \
            .single() \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Update status to in_progress and save call_id if provided
        update_data: Dict[str, Any] = {"status": "in_progress"}
        if call_id:
            update_data["latest_call_id"] = call_id

        supabase.table("voice_candidates") \
            .update(update_data) \
            .eq("id", result.data["id"]) \
            .execute()

        logger.info(f"✅ Call started for candidate {result.data['id']}, call_id: {call_id}")
        return {"status": "in_progress"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error starting call: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start call: {str(e)}")


@router.post("/candidates/token/{token}/reconnect", summary="Log microphone reconnection event (public)")
async def log_reconnection_event(token: str, call_id: str, timestamp: str, event_type: str = "reconnect_attempt"):
    """
    Log a microphone disconnection/reconnection event during an active call.

    This is a public endpoint (no auth) used by the interview page to track
    when candidates experience microphone issues during calls.

    Args:
        token: Candidate interview token
        call_id: VAPI call ID
        timestamp: ISO 8601 timestamp of the event
        event_type: Type of event (disconnect, reconnect_attempt, reconnect_success)
    """
    try:
        supabase = get_supabase()

        # Find candidate by token
        candidate_result = supabase.table("voice_candidates") \
            .select("id") \
            .eq("interview_token", token) \
            .single() \
            .execute()

        if not candidate_result.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Find the call history record
        call_result = supabase.table("voice_call_history") \
            .select("id, disconnect_events") \
            .eq("call_id", call_id) \
            .eq("candidate_id", candidate_result.data["id"]) \
            .execute()

        if not call_result.data:
            # Call might not be in history yet (early disconnect)
            logger.warning(f"Call {call_id} not found in history - event logged to candidate notes")
            return {"status": "logged_to_notes"}

        call_record = call_result.data[0]

        # Get existing disconnect events or initialize empty array
        disconnect_events = call_record.get("disconnect_events") or []

        # Determine reconnection attempt number
        reconnection_attempt = sum(
            1 for e in disconnect_events if e.get("event_type") == "reconnect_attempt"
        ) + 1

        # Add new event
        new_event = {
            "timestamp": timestamp,
            "event_type": event_type,
            "reconnection_attempt": reconnection_attempt if "reconnect" in event_type else None
        }

        disconnect_events.append(new_event)

        # Update call history
        supabase.table("voice_call_history") \
            .update({"disconnect_events": disconnect_events}) \
            .eq("id", call_record["id"]) \
            .execute()

        logger.info(
            f"✅ Logged {event_type} event for call {call_id}, "
            f"attempt #{reconnection_attempt if 'reconnect' in event_type else 'N/A'}"
        )

        return {
            "status": "logged",
            "event_type": event_type,
            "reconnection_attempt": reconnection_attempt if "reconnect" in event_type else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error logging reconnection event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to log event: {str(e)}")


# ============================================================================
# CALL HISTORY ENDPOINTS
# ============================================================================

@router.get("/campaigns/{campaign_id}/debug-config")
async def debug_campaign_config(campaign_id: str):
    """Debug endpoint to check campaign vapi_config structure."""
    try:
        supabase = get_supabase_client()

        result = supabase.table("voice_screening_campaigns") \
            .select("id, name, vapi_config, generated_schema") \
            .eq("id", campaign_id) \
            .single() \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        campaign = result.data
        vapi_config = campaign.get("vapi_config", {})

        # Check if analysisPlan exists
        has_analysis_plan = "analysisPlan" in vapi_config
        has_structured_data_plan = False
        schema_fields_count = 0

        if has_analysis_plan:
            analysis_plan = vapi_config.get("analysisPlan", {})
            has_structured_data_plan = "structuredDataPlan" in analysis_plan
            if has_structured_data_plan:
                structured_plan = analysis_plan.get("structuredDataPlan", {})
                schema = structured_plan.get("schema", {})
                properties = schema.get("properties", {})
                schema_fields_count = len(properties)

        return {
            "campaign_id": campaign_id,
            "campaign_name": campaign.get("name"),
            "has_vapi_config": bool(vapi_config),
            "has_analysis_plan": has_analysis_plan,
            "has_structured_data_plan": has_structured_data_plan,
            "schema_fields_count": schema_fields_count,
            "generated_schema_fields": len(campaign.get("generated_schema", {})),
            "vapi_config_keys": list(vapi_config.keys()),
            "analysis_plan_preview": vapi_config.get("analysisPlan", {}) if has_analysis_plan else None
        }

    except Exception as e:
        logger.error(f"❌ Error debugging campaign config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidates/token/{token}/fetch-call-data", response_model=FetchCallDataResponse)
async def fetch_call_data(
    token: str,
    request: FetchCallDataRequest,
    background_tasks: BackgroundTasks
):
    """
    Fetch call data from VAPI API and store in call_history.
    Generates AI summary in background.
    """
    try:
        supabase = get_supabase()
        settings = get_settings()

        # Get candidate
        candidate_result = supabase.table("voice_candidates") \
            .select("*") \
            .eq("interview_token", token) \
            .single() \
            .execute()

        if not candidate_result.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        candidate = candidate_result.data

        # Dedup: check if call data already saved (e.g. by webhook)
        existing = supabase.table("voice_call_history") \
            .select("id") \
            .eq("call_id", request.call_id) \
            .execute()

        if existing.data:
            logger.info(f"ℹ️ Call {request.call_id} already saved, returning existing record")
            return FetchCallDataResponse(
                success=True,
                message="Call data already saved (by webhook)",
                call_history_id=existing.data[0]["id"]
            )

        # Fetch call data from VAPI
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"https://api.vapi.ai/call/{request.call_id}",
                headers={"Authorization": f"Bearer {settings.VAPI_PRIVATE_KEY}"}
            )
            response.raise_for_status()
            call_data = response.json()

        # Extract data
        transcript = call_data.get("transcript", "")
        recording_url = call_data.get("recordingUrl")

        # Debug: Log the entire analysis object to see what VAPI returns
        analysis_data = call_data.get("analysis", {})
        logger.info(f"🔍 VAPI analysis object keys: {list(analysis_data.keys())}")
        logger.info(f"🔍 VAPI analysis object: {analysis_data}")

        structured_data = analysis_data.get("structuredData", {})
        logger.info(f"📊 Extracted structured_data: {structured_data}")
        logger.info(f"📊 Structured data fields count: {len(structured_data) if structured_data else 0}")

        started_at = call_data.get("startedAt")
        ended_at = call_data.get("endedAt")
        duration = call_data.get("duration")  # seconds
        cost = call_data.get("cost")

        # Map VAPI status to allowed DB values (in_progress, completed, failed)
        vapi_status = call_data.get("status", "completed")
        status_map = {
            "ended": "completed",
            "queued": "completed",
            "ringing": "in_progress",
            "in-progress": "in_progress",
        }
        db_status = status_map.get(vapi_status, "completed")

        # Insert into call_history
        call_history_data = {
            "candidate_id": candidate["id"],
            "call_id": request.call_id,
            "status": db_status,
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_seconds": duration,
            "transcript": transcript,
            "recording_url": recording_url,
            "structured_data": structured_data,
            "call_type": "actual",
            "vapi_cost_cents": int(cost * 100) if cost else None,
            "vapi_duration_minutes": round(duration / 60, 2) if duration else None,
            "vapi_metadata": {"raw_call_data": call_data}
        }

        history_result = supabase.table("voice_call_history").insert(call_history_data).execute()

        if not history_result.data:
            raise HTTPException(status_code=500, detail="Failed to save call history")

        call_history_id = history_result.data[0]["id"]

        # Update candidate
        supabase.table("voice_candidates") \
            .update({
                "status": "completed",
                "latest_call_id": request.call_id
            }) \
            .eq("id", candidate["id"]) \
            .execute()

        # Generate summary in background
        if transcript:
            campaign_result = supabase.table("voice_screening_campaigns") \
                .select("job_role, technical_requirements") \
                .eq("id", candidate.get("campaign_id")) \
                .single() \
                .execute()

            job_role = campaign_result.data.get("job_role") if campaign_result.data else None
            tech_req = campaign_result.data.get("technical_requirements") if campaign_result.data else None

            background_tasks.add_task(
                generate_and_save_summary,
                call_history_id,
                transcript,
                structured_data,
                job_role,
                tech_req
            )

        logger.info(f"✅ Fetched call data for {request.call_id}")

        # Add warning if no structured data was extracted
        if not structured_data or len(structured_data) == 0:
            logger.warning(f"⚠️ No structured data extracted from call {request.call_id}")
            logger.warning(f"⚠️ Check if campaign vapi_config has analysisPlan.structuredDataPlan enabled")

        return FetchCallDataResponse(
            success=True,
            message="Call data fetched successfully",
            call_data=call_data,
            call_history_id=call_history_id
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"❌ VAPI API error: {e.response.status_code}")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch call data from VAPI")
    except Exception as e:
        logger.error(f"❌ Error fetching call data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def generate_and_save_summary(
    call_history_id: str,
    transcript: str,
    structured_data: dict,
    job_role: str = None,
    technical_requirements: str = None
):
    """Background task to generate and save interview summary."""
    try:
        # Generate summary
        summary_service = get_interview_summary_service()
        summary_result = await summary_service.generate_summary(
            transcript=transcript,
            structured_data=structured_data,
            job_role=job_role,
            technical_requirements=technical_requirements
        )

        # Save to database
        supabase = get_supabase()
        supabase.table("voice_call_history") \
            .update({
                "interview_summary": summary_result.get("interview_summary"),
                "key_points": summary_result.get("key_points", []),
                "technical_assessment": summary_result.get("technical_assessment", {})
            }) \
            .eq("id", call_history_id) \
            .execute()

        logger.info(f"✅ Generated summary for call history {call_history_id}")

    except Exception as e:
        logger.error(f"❌ Error generating summary: {str(e)}")


@router.get("/candidates/{candidate_id}/call-history", response_model=List[CallHistoryResponse])
async def get_call_history(
    candidate_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:view'))
):
    """Get all calls for a candidate."""
    try:
        supabase = get_supabase()

        # Verify candidate belongs to org
        candidate_check = supabase.table("voice_candidates") \
            .select("id") \
            .eq("id", candidate_id) \
            .eq("org_id", ctx.org_id) \
            .single() \
            .execute()

        if not candidate_check.data:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Get call history
        result = supabase.table("voice_call_history") \
            .select("*") \
            .eq("candidate_id", candidate_id) \
            .order("created_at", desc=True) \
            .execute()

        return [CallHistoryResponse(**call) for call in result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error fetching call history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/call-history/{call_history_id}/re-evaluate")
async def re_evaluate_interview(
    call_history_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """
    Re-generate AI summary and technical assessment from existing transcript.
    Useful when the original analysis needs to be updated or regenerated.
    """
    try:
        supabase = get_supabase()

        # Get call history record with org check via voice_candidates
        call_result = supabase.table("voice_call_history") \
            .select("*, voice_candidates!inner(org_id, campaign_id)") \
            .eq("id", call_history_id) \
            .single() \
            .execute()

        if not call_result.data:
            raise HTTPException(status_code=404, detail="Call history not found")

        call_data = call_result.data

        # Verify org membership
        if call_data["voice_candidates"]["org_id"] != ctx.org_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Check if transcript exists
        if not call_data.get("transcript"):
            raise HTTPException(status_code=400, detail="No transcript available for re-evaluation")

        # Get campaign details for context
        job_role = None
        technical_requirements = None
        campaign_id = call_data["voice_candidates"].get("campaign_id")

        if campaign_id:
            campaign_result = supabase.table("voice_screening_campaigns") \
                .select("job_role, technical_requirements") \
                .eq("id", campaign_id) \
                .single() \
                .execute()

            if campaign_result.data:
                job_role = campaign_result.data.get("job_role")
                technical_requirements = campaign_result.data.get("technical_requirements")

        # Generate new summary
        summary_service = get_interview_summary_service()
        summary_result = await summary_service.generate_summary(
            transcript=call_data["transcript"],
            structured_data=call_data.get("structured_data", {}),
            job_role=job_role,
            technical_requirements=technical_requirements
        )

        # Update database with new summary
        update_result = supabase.table("voice_call_history") \
            .update({
                "interview_summary": summary_result.get("interview_summary"),
                "key_points": summary_result.get("key_points", []),
                "technical_assessment": summary_result.get("technical_assessment", {})
            }) \
            .eq("id", call_history_id) \
            .execute()

        logger.info(f"✅ Re-evaluated call history {call_history_id}")

        # Return updated record
        if update_result.data:
            return CallHistoryResponse(**update_result.data[0])
        else:
            raise HTTPException(status_code=500, detail="Failed to update call history")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error re-evaluating interview: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# VAPI FILE UPLOAD ENDPOINTS
# ============================================================================

@router.post("/files/upload")
async def upload_file_to_vapi(
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Upload file to VAPI for knowledge base."""
    
    import tempfile
    import os

    temp_path = None
    try:
        vapi_file_service = get_vapi_file_service()

        # Save to cross-platform temporary directory
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, file.filename)

        with open(temp_path, "wb") as f:
            f.write(await file.read())

        # Upload to VAPI
        result = await vapi_file_service.upload_file(temp_path, file.filename)

        logger.info(f"✅ Uploaded file to VAPI: {result['file_id']}")

        return result

    except Exception as e:
        logger.error(f"❌ Error uploading file to VAPI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as cleanup_error:
                logger.warning(f"⚠️ Failed to clean up temp file: {cleanup_error}")


@router.get("/files")
async def list_vapi_files(ctx: OrgContext = Depends(require_permission('campaign:view'))):
    """List all files in VAPI."""
    try:
        vapi_file_service = get_vapi_file_service()
        files = await vapi_file_service.list_files()

        return {"files": files}

    except Exception as e:
        logger.error(f"❌ Error listing VAPI files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{file_id}")
async def delete_vapi_file(
    file_id: str,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Delete file from VAPI."""
    try:
        
        vapi_file_service = get_vapi_file_service()
        success = await vapi_file_service.delete_file(file_id)

        if success:
            return {"message": "File deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete file")

    except Exception as e:
        logger.error(f"❌ Error deleting VAPI file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# QUESTION GENERATION ENDPOINT
# ============================================================================

@router.post("/generate-questions", response_model=QuestionGenerationResponse)
async def generate_questions(
    request: QuestionGenerationRequest,
    ctx: OrgContext = Depends(require_permission('campaign:create'))
):
    """Generate interview questions using Ollama."""
    try:
        
        import ollama

        # Build context based on question_basis
        context_parts = []

        if request.question_basis:
            if "job_description" in request.question_basis and request.job_description_text:
                context_parts.append(f"Job Description: {request.job_description_text[:500]}")
            if "technical_requirements" in request.question_basis and request.technical_requirements:
                context_parts.append(f"Technical Requirements: {request.technical_requirements}")
            if "job_role" in request.question_basis:
                context_parts.append(f"Job Role: {request.job_role}")
        else:
            # Default fallback
            if request.job_description_text:
                context_parts.append(f"Job Description: {request.job_description_text[:500]}")
            if request.technical_requirements:
                context_parts.append(f"Technical Requirements: {request.technical_requirements}")

        context = "\n\n".join(context_parts) if context_parts else f"Job Role: {request.job_role}"

        # Build focus areas instruction
        focus_instruction = ""
        if request.focus_areas and len(request.focus_areas) > 0:
            focus_instruction = f"\nFocus specifically on these areas: {', '.join(request.focus_areas)}"

        # Build adaptive questioning instruction
        adaptive_instruction = ""
        if request.enable_adaptive_questioning:
            adaptive_instruction = """
- Design questions that naturally lead to follow-up discussions
- Include open-ended questions that encourage detailed responses
- Create questions that allow for probing deeper based on candidate answers"""

        # Build prompt
        prompt = f"""Generate {request.num_questions} interview questions for a {request.job_role} position.

Candidate type: {request.candidate_type.value}

{context}{focus_instruction}

Generate questions that:
1. Are relevant to the job role and requirements
2. Match the candidate's experience level ({request.candidate_type.value})
3. Are conversational and natural
4. Cover technical skills, experience, and soft skills{adaptive_instruction}

Return ONLY a JSON array of strings: ["Question 1", "Question 2", ...]
"""

        response = ollama.chat(
            model="qwen2.5:7b",
            messages=[
                {"role": "system", "content": "You are an expert technical recruiter. Generate high-quality interview questions that feel natural and conversational."},
                {"role": "user", "content": prompt}
            ],
            options={"temperature": 0.7}
        )

        response_text = response["message"]["content"]

        # Parse questions
        import json
        import re

        # Try to extract JSON array
        if response_text.startswith("```"):
            response_text = re.sub(r"```(?:json)?\\n?", "", response_text).strip()

        try:
            questions = json.loads(response_text)
            if isinstance(questions, list):
                # Handle list of dicts with 'question' key
                if questions and isinstance(questions[0], dict) and 'question' in questions[0]:
                    questions = [q['question'] for q in questions if isinstance(q, dict) and 'question' in q]
            else:
                questions = []
        except:
            questions = []

        if not questions:
            # Fallback: extract lines that look like questions
            questions = [line.strip() for line in response_text.split("\\n") if line.strip() and "?" in line]

        logger.info(f"✅ Generated {len(questions)} questions")

        return QuestionGenerationResponse(
            questions=questions[:request.num_questions],
            model="qwen2.5:7b"
        )

    except Exception as e:
        logger.error(f"❌ Error generating questions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WEBHOOK ENDPOINT
# ============================================================================

@router.post("/webhook")
async def vapi_webhook(request: Request, background_tasks: BackgroundTasks):
    """Handle VAPI webhooks (end-of-call reports, function calls, etc.)."""
    try:
        # Log raw request for debugging
        body = await request.body()
        logger.info(f"🔔 WEBHOOK RECEIVED - Raw body length: {len(body)} bytes")
        logger.info(f"🔔 WEBHOOK HEADERS: {dict(request.headers)}")

        # Parse as JSON
        payload_dict = await request.json() if body else {}
        logger.info(f"📥 Parsed VAPI webhook: {payload_dict}")

        # Handle different webhook types
        message = payload_dict.get("message", {})
        message_type = message.get("type") if message else None

        logger.info(f"📨 Message type: {message_type}")

        if message_type == "end-of-call-report":
            # Extract call data from the webhook payload
            call_data = message.get("call", {})
            call_id = call_data.get("id")
            transcript = message.get("transcript", "") or call_data.get("transcript", "")
            recording_url = message.get("recordingUrl") or call_data.get("recordingUrl")
            structured_data = message.get("analysis", {}).get("structuredData", {}) or {}

            logger.info(f"✅ Received end-of-call report for call {call_id}")
            logger.info(f"📝 Transcript length: {len(transcript)} chars")
            logger.info(f"🎙️ Recording URL: {recording_url}")

            if call_id:
                supabase = get_supabase()

                # Dedup: check if already saved
                existing = supabase.table("voice_call_history") \
                    .select("id") \
                    .eq("call_id", call_id) \
                    .execute()

                if existing.data:
                    logger.info(f"ℹ️ Call {call_id} already saved in voice_call_history, skipping webhook save")
                else:
                    # Find candidate by latest_call_id
                    try:
                        candidate_result = supabase.table("voice_candidates") \
                            .select("id, campaign_id") \
                            .eq("latest_call_id", call_id) \
                            .single() \
                            .execute()
                        candidate = candidate_result.data
                    except Exception as e:
                        # No candidate found with this call_id (Vapi sent event for unknown call)
                        logger.info(f"No candidate found for call_id {call_id}, skipping webhook save")
                        candidate = None

                    if candidate:

                        started_at = call_data.get("startedAt")
                        ended_at = call_data.get("endedAt")
                        duration = call_data.get("duration")
                        cost = call_data.get("cost")

                        vapi_status = call_data.get("status", "completed")
                        status_map = {
                            "ended": "completed",
                            "queued": "completed",
                            "ringing": "in_progress",
                            "in-progress": "in_progress",
                        }
                        db_status = status_map.get(vapi_status, "completed")

                        call_history_data = {
                            "candidate_id": candidate["id"],
                            "call_id": call_id,
                            "status": db_status,
                            "started_at": started_at,
                            "ended_at": ended_at,
                            "duration_seconds": duration,
                            "transcript": transcript,
                            "recording_url": recording_url,
                            "structured_data": structured_data,
                            "call_type": "actual",
                            "vapi_cost_cents": int(cost * 100) if cost else None,
                            "vapi_duration_minutes": round(duration / 60, 2) if duration else None,
                            "vapi_metadata": {"source": "webhook", "raw_message": message}
                        }

                        history_result = supabase.table("voice_call_history").insert(call_history_data).execute()

                        if history_result.data:
                            call_history_id = history_result.data[0]["id"]
                            logger.info(f"✅ Webhook saved call data for {call_id}, history_id: {call_history_id}")

                            # Update candidate status
                            supabase.table("voice_candidates") \
                                .update({"status": "completed"}) \
                                .eq("id", candidate["id"]) \
                                .execute()

                            # Generate summary in background
                            if transcript:
                                campaign_result = supabase.table("voice_screening_campaigns") \
                                    .select("job_role, technical_requirements") \
                                    .eq("id", candidate.get("campaign_id")) \
                                    .single() \
                                    .execute()

                                job_role = campaign_result.data.get("job_role") if campaign_result.data else None
                                tech_req = campaign_result.data.get("technical_requirements") if campaign_result.data else None

                                background_tasks.add_task(
                                    generate_and_save_summary,
                                    call_history_id,
                                    transcript,
                                    structured_data,
                                    job_role,
                                    tech_req
                                )
                        else:
                            logger.error(f"❌ Webhook failed to insert call history for {call_id}")
                    else:
                        logger.warning(f"⚠️ No candidate found with latest_call_id={call_id}, webhook data not saved")

        elif message_type == "function-call":
            # Handle function calling (e.g., end_call)
            function_call = message.get("functionCall", {})
            function_name = function_call.get("name")

            logger.info(f"📞 Function called: {function_name}")

        return {"status": "received"}

    except Exception as e:
        logger.error(f"❌ Error processing webhook: {str(e)}")
        return {"status": "error", "message": str(e)}


# ============================================================================
# EXPORT ENDPOINT
# ============================================================================

@router.get("/export")
async def export_candidates(
    campaign_id: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission('campaign:view'))
):
    """Export candidates to Excel with call history and summaries."""
    try:
        supabase = get_supabase()

        # Fetch candidates
        query = supabase.table("voice_candidates") \
            .select("*") \
            .eq("org_id", ctx.org_id)

        if campaign_id:
            query = query.eq("campaign_id", campaign_id)

        candidates_result = query.execute()
        candidates = candidates_result.data

        # Fetch call history for all candidates
        candidate_ids = [c["id"] for c in candidates]
        call_history_result = supabase.table("voice_call_history") \
            .select("*") \
            .in_("candidate_id", candidate_ids) \
            .execute()

        call_history_map = {}
        for call in call_history_result.data:
            cid = call["candidate_id"]
            if cid not in call_history_map:
                call_history_map[cid] = []
            call_history_map[cid].append(call)

        # Get settings for frontend URL
        settings = get_settings()

        # Build export data
        export_data = []
        for candidate in candidates:
            calls = call_history_map.get(candidate["id"], [])
            latest_call = calls[0] if calls else None

            row = {
                "Name": candidate.get("name"),
                "Email": candidate.get("email"),
                "Phone": candidate.get("phone"),
                "Status": candidate.get("status"),
                "Campaign ID": candidate.get("campaign_id"),
                "Interview Link": f"{settings.FRONTEND_URL}/voice-interview/{candidate['interview_token']}",
                "Total Calls": len(calls)
            }

            # Add latest call data
            if latest_call:
                row["Latest Call Date"] = latest_call.get("created_at")
                row["Duration (mins)"] = latest_call.get("vapi_duration_minutes")
                row["Summary"] = latest_call.get("interview_summary")
                row["Recommendation"] = latest_call.get("technical_assessment", {}).get("recommendation")
                row["Experience Level"] = latest_call.get("technical_assessment", {}).get("experience_level")

                # Add structured data fields
                structured = latest_call.get("structured_data", {})
                for key, value in structured.items():
                    row[key] = value

            export_data.append(row)

        # Create Excel
        df = pd.DataFrame(export_data)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Candidates')

        output.seek(0)

        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="voice_screening_export.xlsx"'}
        )

    except Exception as e:
        logger.error(f"❌ Error exporting candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
