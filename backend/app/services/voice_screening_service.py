"""Voice screening service for Vapi integration."""

import logging
import uuid
import io
from typing import Optional, List
from datetime import datetime

from app.db.supabase_client import get_supabase
from app.config import settings
from app.services.user_service import get_user_service

logger = logging.getLogger(__name__)


class VoiceScreeningService:
    """Service for voice screening candidate management."""

    def __init__(self):
        self.client = get_supabase()
        self.user_service = get_user_service()

    def _generate_token(self) -> str:
        """Generate a unique interview token (12 chars)."""
        return uuid.uuid4().hex[:12]

    async def create_candidate(
        self,
        name: str,
        user_id: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        is_fresher: bool = False,
        campaign_id: Optional[str] = None,
        org_id: Optional[str] = None
    ) -> dict:
        """Create a single voice screening candidate."""
        user_id = self.user_service.resolve_user_id(user_id)
        token = self._generate_token()

        data = {
            "interview_token": token,
            "name": name,
            "email": email,
            "phone": phone,
            "is_fresher": is_fresher,
            "campaign_id": campaign_id,
            "status": "pending",
            "created_by": user_id,
        }
        if org_id:
            data["org_id"] = org_id

        result = self.client.table("voice_candidates").insert(data).execute()

        if not result.data:
            raise Exception("Failed to create candidate")

        return result.data[0]

    async def bulk_create_candidates(
        self,
        candidates: List[dict],
        user_id: str,
        org_id: Optional[str] = None
    ) -> dict:
        """Bulk create voice screening candidates."""
        user_id = self.user_service.resolve_user_id(user_id)
        records = []
        for c in candidates:
            record = {
                "interview_token": self._generate_token(),
                "name": c.get("name", ""),
                "email": c.get("email"),
                "phone": c.get("phone"),
                "is_fresher": c.get("is_fresher", False),
                "status": "pending",
                "created_by": user_id,
            }
            if org_id:
                record["org_id"] = org_id
            records.append(record)

        result = self.client.table("voice_candidates").insert(records).execute()

        return {
            "created": len(result.data) if result.data else 0,
            "candidates": result.data or []
        }

    async def list_candidates(
        self,
        user_id: str,
        limit: int = 100,
        offset: int = 0,
        status_filter: Optional[str] = None,
        org_id: Optional[str] = None
    ) -> dict:
        """List voice candidates for the user's org or by created_by."""
        user_id = self.user_service.resolve_user_id(user_id)
        query = self.client.table("voice_candidates").select("*")

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        query = query.order("created_at", desc=True).limit(limit).offset(offset)

        if status_filter:
            query = query.eq("status", status_filter)

        result = query.execute()

        return {
            "candidates": result.data or [],
            "count": len(result.data) if result.data else 0
        }

    async def get_candidate_by_token(self, token: str) -> dict:
        """Get candidate by interview token (for shareable link)."""
        result = (
            self.client.table("voice_candidates")
            .select("*")
            .eq("interview_token", token)
            .execute()
        )

        if not result.data:
            raise ValueError("Candidate not found")

        return result.data[0]

    async def get_candidate_by_id(self, candidate_id: str, user_id: str, org_id: Optional[str] = None) -> dict:
        """Get candidate by ID (requires org membership or ownership)."""
        user_id = self.user_service.resolve_user_id(user_id)
        query = self.client.table("voice_candidates").select("*").eq("id", candidate_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.execute()

        if not result.data:
            raise ValueError("Candidate not found")

        return result.data[0]

    async def update_candidate_status(self, token: str, status: str, call_id: Optional[str] = None):
        """Update candidate status."""
        update_data = {"status": status}
        if call_id:
            update_data["call_id"] = call_id

        self.client.table("voice_candidates").update(update_data).eq(
            "interview_token", token
        ).execute()

    async def update_candidate_from_webhook(self, call_id: str, extracted_data: dict):
        """Update candidate with data extracted from Vapi call."""
        # Map the extracted fields
        update_data = {
            "status": "completed",
            "transcript": extracted_data.get("transcript"),
            "recording_url": extracted_data.get("recordingUrl") or extracted_data.get("recording_url"),
        }

        # Map structured data fields
        field_mapping = {
            "name": "name",
            "gender": "gender",
            "email": "email",
            "phone": "phone",
            "phone_number": "phone",
            "current_work_location": "current_work_location",
            "native": "native_location",
            "native_location": "native_location",
            "current_employer": "current_employer",
            "work_type": "work_type",
            "employment_type": "employment_type",
            "full_time_part_time": "employment_type",
            "current_role": "current_role",
            "current_role_designation": "current_role",
            "expertise_in": "expertise_in",
            "total_experience": "total_experience",
            "certifications": "certifications",
            "certification_any": "certifications",
            "projects_handled": "projects_handled",
            "how_many_projects_handled": "projects_handled",
            "current_ctc": "current_ctc",
            "current_ctc_lpa": "current_ctc",
            "expected_ctc": "expected_ctc",
            "expected_ctc_lpa": "expected_ctc",
            "notice_period": "notice_period",
            "notice_period_as_per_company_norms": "notice_period",
            "serving_notice_period": "serving_notice_period",
            "is_serving_notice_period": "serving_notice_period",
            "tentative_joining_date": "tentative_joining_date",
            "existing_offers": "existing_offers",
            "any_existing_offers": "existing_offers",
            "available_interview_time": "available_interview_time",
            "available_time_for_interview": "available_interview_time",
            "current_team_size": "current_team_size",
            "current_team_members_size": "current_team_size",
            "current_shift_timing": "current_shift_timing",
            "reason_for_leaving": "reason_for_leaving",
            "why_leaving_current_job": "reason_for_leaving",
        }

        # Extract structured data from webhook
        structured_data = extracted_data.get("structuredData", {})
        if isinstance(structured_data, dict):
            for src_key, dest_key in field_mapping.items():
                value = structured_data.get(src_key)
                if value and dest_key not in update_data:
                    update_data[dest_key] = str(value)

        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}

        # Check if candidate exists with this call_id
        result = self.client.table("voice_candidates").select("id").eq("call_id", call_id).execute()

        # Fallback: If not found, it means the frontend failed to send the call_id when starting.
        # Find the most recently updated "in_progress" candidate and manually link them!
        if not result.data:
            fallback = self.client.table("voice_candidates").select("id").eq("status", "in_progress").order("updated_at", desc=True).limit(1).execute()
            if fallback.data:
                fallback_id = fallback.data[0]["id"]
                logger.info(f"Fallback linking webhook call_id {call_id} to candidate {fallback_id}")
                self.client.table("voice_candidates").update({"call_id": call_id}).eq("id", fallback_id).execute()
            else:
                logger.warning(f"Could not find candidate for call_id {call_id} and no in_progress fallback candidates found.")

        # Apply webhook update
        self.client.table("voice_candidates").update(update_data).eq(
            "call_id", call_id
        ).execute()

        # Send completion email to candidate (fire-and-forget)
        try:
            from app.services.email_service import send_voice_interview_completion

            # Get candidate details for email
            candidate_result = self.client.table("voice_candidates").select(
                "name, email, campaign_name"
            ).eq("call_id", call_id).execute()

            if candidate_result.data:
                candidate = candidate_result.data[0]
                candidate_email = candidate.get("email") or update_data.get("email")
                candidate_name = candidate.get("name", "Candidate")
                campaign_name = candidate.get("campaign_name", "Voice Screening")

                if candidate_email:
                    send_voice_interview_completion(
                        candidate_email=candidate_email,
                        candidate_name=candidate_name,
                        campaign_name=campaign_name
                    )
                    logger.info(f"Completion email sent to {candidate_email}")
        except Exception as email_err:
            logger.warning(f"Failed to send completion email: {email_err}")

        # Sync to pipeline if candidate exists there
        try:
            from app.services.pipeline_service import get_pipeline_service
            pipeline = get_pipeline_service()
            # Find the voice_candidate id for this call
            vc_result = self.client.table("voice_candidates").select("id").eq("call_id", call_id).execute()
            if vc_result.data:
                pipeline.sync_voice_results(vc_result.data[0]["id"], update_data.get("status", "completed"))
        except Exception as pe:
            logger.debug(f"Pipeline sync skipped: {pe}")

    async def delete_candidate(self, candidate_id: str, user_id: str, org_id: Optional[str] = None):
        """Delete a candidate."""
        user_id = self.user_service.resolve_user_id(user_id)
        query = self.client.table("voice_candidates").delete().eq("id", candidate_id)

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.execute()

        if not result.data:
            raise ValueError("Candidate not found or not authorized")

        return {"message": "Candidate deleted"}

    async def export_to_excel(self, user_id: str, org_id: Optional[str] = None) -> bytes:
        """Export all completed candidates to Excel."""
        user_id = self.user_service.resolve_user_id(user_id)
        import pandas as pd

        query = self.client.table("voice_candidates").select("*")

        if org_id:
            query = query.eq("org_id", org_id)
        else:
            query = query.eq("created_by", user_id)

        result = query.order("created_at", desc=True).execute()

        candidates = result.data or []

        # Define column mapping for the Excel export
        columns = {
            "name": "Name",
            "gender": "Gender",
            "email": "Email",
            "phone": "Phone Number",
            "current_work_location": "Current Work Location",
            "native_location": "Native",
            "current_employer": "Current Employer",
            "work_type": "Work Type",
            "employment_type": "Full Time/Part Time",
            "current_role": "Current Role/Designation",
            "expertise_in": "Expertise In",
            "total_experience": "Total Experience",
            "certifications": "Certification any?",
            "projects_handled": "How many projects Handled",
            "current_ctc": "Current CTC(LPA)",
            "expected_ctc": "Expected CTC(LPA)",
            "notice_period": "Notice Period as per company norms",
            "serving_notice_period": "Is Serving Notice Period?",
            "tentative_joining_date": "Tentative Joining Date?",
            "existing_offers": "Any Existing Offers?",
            "available_interview_time": "Available Time For Interview?",
            "current_team_size": "Current Team Members size",
            "current_shift_timing": "Current Shift Timing",
            "reason_for_leaving": "Why Leaving Current Job?",
            "status": "Status",
            "is_fresher": "Fresher?",
            "recording_url": "Recording URL",
        }

        # Build dataframe
        rows = []
        for c in candidates:
            row = {}
            for db_col, excel_col in columns.items():
                row[excel_col] = c.get(db_col, "")
            rows.append(row)

        df = pd.DataFrame(rows, columns=list(columns.values()))

        # Write to Excel bytes
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Voice Screening")

            # Auto-adjust column widths safely
            worksheet = writer.sheets["Voice Screening"]
            for i, col in enumerate(df.columns):
                col_len = len(str(col))
                try:
                    # Safely get max length of strings in column
                    if len(df) > 0:
                        max_val_len = df[col].astype(str).str.len().max()
                        if pd.isna(max_val_len):
                            max_len = col_len + 2
                        else:
                            max_len = max(int(max_val_len), col_len) + 2
                    else:
                        max_len = col_len + 2
                except Exception:
                    max_len = col_len + 2

                col_letter = chr(65 + i) if i < 26 else chr(64 + i // 26) + chr(65 + i % 26)
                worksheet.column_dimensions[col_letter].width = min(max_len, 40)

        output.seek(0)
        return output.getvalue()


# Singleton
_service_instance = None


def get_voice_screening_service() -> VoiceScreeningService:
    """Get or create voice screening service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = VoiceScreeningService()
    return _service_instance
