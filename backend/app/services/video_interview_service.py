"""
Video Interview Service - Manages video interviews via Daily.co.

This service handles:
- Scheduling video interviews
- Creating Daily.co rooms
- Generating meeting tokens
- Recording management
- Transcription processing
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import requests
import logging
from app.db.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)


class VideoInterviewService:
    """Service for managing video interviews via Daily.co."""

    def __init__(self):
        """Initialize the video interview service."""
        self.client = get_supabase()
        self.daily_api_base = "https://api.daily.co/v1"
        self.daily_api_key = settings.DAILY_API_KEY

    async def schedule_interview(
        self,
        job_id: str,
        candidate_email: str,
        candidate_name: str,
        scheduled_at: datetime,
        duration_minutes: int,
        interviewers: List[Dict],
        created_by: str,
        resume_id: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        questions: Optional[List[Dict]] = None
    ) -> Dict:
        """
        Schedule a new video interview.

        Args:
            job_id: Job description ID
            candidate_email: Candidate's email address
            candidate_name: Candidate's full name
            scheduled_at: Interview scheduled datetime
            duration_minutes: Expected duration in minutes
            interviewers: List of interviewer dicts with 'name' and 'email'
            created_by: User ID of the person scheduling
            resume_id: Optional resume ID if linked
            title: Optional custom title
            description: Optional description
            questions: Optional pre-loaded questions

        Returns:
            Dict with interview details and join URLs

        Steps:
        1. Create Daily.co room
        2. Create interview record in database
        3. Add participants (candidate + interviewers)
        4. Generate meeting tokens for each participant
        5. Return join URLs
        """
        try:
            # 1. Create Daily.co room
            # Sanitize candidate name for room name (lowercase, alphanumeric and hyphens only)
            safe_name = ''.join(c if c.isalnum() or c == ' ' else '' for c in candidate_name)
            safe_name = safe_name.replace(' ', '-').lower()
            room_name = f"interview-{safe_name}-{scheduled_at.strftime('%Y%m%d-%H%M')}"

            room = await self._create_daily_room(
                name=room_name,
                properties={
                    # Free tier settings - using local recording only (no cloud recording)
                    # All participants can record locally on their own devices
                    "enable_screenshare": True,
                    "enable_chat": True,
                    "start_video_off": False,
                    "start_audio_off": False,
                    "exp": int((scheduled_at + timedelta(minutes=duration_minutes + 60)).timestamp())  # Expires 1 hour after scheduled end
                }
            )

            # 2. Create interview record
            interview_title = title or f"Interview with {candidate_name}"
            interview_data = {
                "job_description_id": job_id,
                "resume_id": resume_id,
                "candidate_email": candidate_email,
                "candidate_name": candidate_name,
                "title": interview_title,
                "description": description,
                "scheduled_at": scheduled_at.isoformat(),
                "duration_minutes": duration_minutes,
                "status": "scheduled",
                "room_id": room["name"],  # Daily uses room name as ID
                "room_name": room["name"],
                "created_by": created_by
            }

            result = self.client.table("video_interviews") \
                .insert(interview_data) \
                .execute()

            interview = result.data[0]
            interview_id = interview["id"]

            logger.info(f"Created interview record: {interview_id}")

            # 3. Add candidate as participant
            candidate_token = await self._generate_meeting_token(
                room_name=room["name"],
                user_name=candidate_name,
                is_owner=False
            )

            candidate_join_url = f"{settings.FRONTEND_URL}/dashboard/video-interviews/{interview_id}/live?token={candidate_token}"

            candidate_participant = {
                "video_interview_id": interview_id,
                "name": candidate_name,
                "email": candidate_email,
                "role": "candidate",
                "join_token": candidate_token,
                "join_url": candidate_join_url
            }

            self.client.table("video_interview_participants") \
                .insert(candidate_participant) \
                .execute()

            logger.info(f"Added candidate participant: {candidate_email}")

            # 4. Add interviewers
            interviewer_urls = []
            for interviewer in interviewers:
                interviewer_token = await self._generate_meeting_token(
                    room_name=room["name"],
                    user_name=interviewer["name"],
                    is_owner=True  # Interviewers get owner permissions
                )

                interviewer_join_url = f"{settings.FRONTEND_URL}/dashboard/video-interviews/{interview_id}/live?token={interviewer_token}"

                interviewer_participant = {
                    "video_interview_id": interview_id,
                    "name": interviewer["name"],
                    "email": interviewer["email"],
                    "role": "interviewer",
                    "user_id": interviewer.get("user_id"),
                    "join_token": interviewer_token,
                    "join_url": interviewer_join_url
                }

                self.client.table("video_interview_participants") \
                    .insert(interviewer_participant) \
                    .execute()

                interviewer_urls.append({
                    "name": interviewer["name"],
                    "email": interviewer["email"],
                    "join_url": interviewer_join_url
                })

                logger.info(f"Added interviewer: {interviewer['email']}")

            # 5. Add questions if provided
            if questions:
                for idx, question in enumerate(questions, 1):
                    question_data = {
                        "video_interview_id": interview_id,
                        "question_number": idx,
                        "question_text": question["text"],
                        "question_type": question.get("type", "technical"),
                        "difficulty": question.get("difficulty"),
                        "expected_duration_minutes": question.get("duration", 10),
                        "skills_assessed": question.get("skills_assessed", []),
                        "topics": question.get("topics", [])
                    }
                    self.client.table("video_interview_questions") \
                        .insert(question_data) \
                        .execute()

                logger.info(f"Added {len(questions)} questions to interview")

            return {
                "interview_id": interview_id,
                "room_id": room["name"],
                "room_name": room_name,
                "scheduled_at": scheduled_at.isoformat(),
                "duration_minutes": duration_minutes,
                "candidate_join_url": candidate_join_url,
                "interviewer_join_urls": interviewer_urls,
                "total_participants": 1 + len(interviewers)
            }

        except Exception as e:
            logger.error(f"Error scheduling interview: {e}", exc_info=True)
            raise

    async def _create_daily_room(self, name: str, properties: Dict) -> Dict:
        """
        Create a room in Daily.co.

        Args:
            name: Room name (unique identifier)
            properties: Room configuration

        Returns:
            Room details from Daily.co API
        """
        if not self.daily_api_key:
            raise ValueError("Daily.co API key not configured")

        url = f"{self.daily_api_base}/rooms"
        headers = {
            "Authorization": f"Bearer {self.daily_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "name": name,
            "privacy": "private",  # Requires token to join
            "properties": properties
        }

        logger.info(f"Creating Daily.co room with name: {name}")
        response = requests.post(url, json=payload, headers=headers)

        if not response.ok:
            error_detail = response.text
            logger.error(f"Daily.co API error: {response.status_code} - {error_detail}")
            raise ValueError(f"Failed to create Daily.co room: {error_detail}")

        response.raise_for_status()

        room_data = response.json()
        logger.info(f"Created Daily.co room: {room_data['name']}")

        return room_data

    async def _generate_meeting_token(
        self,
        room_name: str,
        user_name: str,
        is_owner: bool = False
    ) -> str:
        """
        Generate meeting token for a participant to join room.

        NOTE: Using local recording only to stay on Daily.co free tier.
        Cloud recording requires paid plan and will trigger credit card prompt.

        Args:
            room_name: Daily.co room name
            user_name: Participant's display name
            is_owner: Whether participant has owner permissions

        Returns:
            Meeting token (JWT)
        """
        if not self.daily_api_key:
            raise ValueError("Daily.co API key not configured")

        url = f"{self.daily_api_base}/meeting-tokens"
        headers = {
            "Authorization": f"Bearer {self.daily_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "properties": {
                "room_name": room_name,
                "user_name": user_name,
                "is_owner": is_owner,
                "enable_recording": "local"  # Always local to avoid paid cloud recording
            }
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        token_data = response.json()
        return token_data["token"]

    async def get_interview_by_id(self, interview_id: str) -> Optional[Dict]:
        """
        Get interview details by ID.

        Args:
            interview_id: Interview UUID

        Returns:
            Interview record or None
        """
        try:
            result = self.client.table("video_interviews") \
                .select("*") \
                .eq("id", interview_id) \
                .single() \
                .execute()

            return result.data if result.data else None

        except Exception as e:
            logger.error(f"Error fetching interview {interview_id}: {e}")
            return None

    async def get_interview_participants(self, interview_id: str) -> List[Dict]:
        """
        Get all participants for an interview.

        Args:
            interview_id: Interview UUID

        Returns:
            List of participant records
        """
        try:
            result = self.client.table("video_interview_participants") \
                .select("*") \
                .eq("video_interview_id", interview_id) \
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching participants for {interview_id}: {e}")
            return []

    async def get_interview_questions(self, interview_id: str) -> List[Dict]:
        """
        Get all questions for an interview.

        Args:
            interview_id: Interview UUID

        Returns:
            List of question records ordered by question_number
        """
        try:
            result = self.client.table("video_interview_questions") \
                .select("*") \
                .eq("video_interview_id", interview_id) \
                .order("question_number") \
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching questions for {interview_id}: {e}")
            return []

    async def update_interview_status(
        self,
        interview_id: str,
        status: str,
        session_id: Optional[str] = None
    ) -> bool:
        """
        Update interview status.

        Args:
            interview_id: Interview UUID
            status: New status ('in_progress', 'completed', 'cancelled')
            session_id: Optional Daily.co session ID

        Returns:
            True if successful
        """
        try:
            update_data = {
                "status": status,
                "updated_at": datetime.utcnow().isoformat()
            }

            if session_id:
                update_data["session_id"] = session_id

            if status == "in_progress":
                update_data["started_at"] = datetime.utcnow().isoformat()
            elif status == "completed":
                update_data["completed_at"] = datetime.utcnow().isoformat()

            self.client.table("video_interviews") \
                .update(update_data) \
                .eq("id", interview_id) \
                .execute()

            logger.info(f"Updated interview {interview_id} status to {status}")
            return True

        except Exception as e:
            logger.error(f"Error updating interview status: {e}")
            return False

    async def handle_recording_ready_webhook(
        self,
        room_name: str,
        recording_id: str,
        download_url: str,
        duration: int
    ) -> bool:
        """
        Handle webhook from Daily.co when recording is ready.

        Steps:
        1. Find interview by room_name
        2. Download recording from Daily.co
        3. Upload to Supabase Storage
        4. Update interview record with recording URL
        5. Trigger transcription (if enabled)

        Args:
            room_name: Daily.co room name
            recording_id: Daily.co recording ID
            download_url: URL to download the recording
            duration: Recording duration in seconds

        Returns:
            True if successful
        """
        try:
            # Find interview by room_name
            result = self.client.table("video_interviews") \
                .select("*") \
                .eq("room_name", room_name) \
                .single() \
                .execute()

            if not result.data:
                logger.error(f"Interview not found for room_name: {room_name}")
                return False

            interview = result.data
            interview_id = interview["id"]

            logger.info(f"Processing recording for interview: {interview_id}")

            # Download recording
            recording_response = requests.get(download_url, timeout=300)
            recording_response.raise_for_status()
            recording_bytes = recording_response.content

            logger.info(f"Downloaded recording: {len(recording_bytes)} bytes")

            # Upload to Supabase Storage
            from app.services.storage_service import StorageService
            storage = StorageService()

            # Ensure bucket exists
            await storage.ensure_buckets_exist()

            upload_result = await storage.upload_file(
                file_data=recording_bytes,
                filename=f"interview_{interview_id}.mp4",
                bucket_type="interview_recordings",
                user_id=interview["created_by"],
                content_type="video/mp4"
            )

            logger.info(f"Uploaded recording to storage: {upload_result['file_path']}")

            # Update interview record
            self.client.table("video_interviews") \
                .update({
                    "recording_id": recording_id,
                    "recording_path": upload_result["file_path"],
                    "recording_duration_seconds": duration,
                    "status": "completed",
                    "updated_at": datetime.utcnow().isoformat()
                }) \
                .eq("id", interview_id) \
                .execute()

            # TODO: Trigger transcription if enabled
            if settings.ENABLE_AI_VIDEO_ANALYSIS:
                logger.info(f"Transcription triggered for interview: {interview_id}")
                # Implement transcription trigger here

            return True

        except Exception as e:
            logger.error(f"Error handling recording webhook: {e}", exc_info=True)
            return False


# Singleton instance
_video_interview_service = None


def get_video_interview_service() -> VideoInterviewService:
    """Get or create singleton video interview service instance."""
    global _video_interview_service
    if _video_interview_service is None:
        _video_interview_service = VideoInterviewService()
    return _video_interview_service
