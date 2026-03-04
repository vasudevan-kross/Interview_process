"""
VAPI Recording Download and Storage Service

Downloads recordings from VAPI's temporary URLs and stores them permanently in Supabase Storage.
This prevents data loss when VAPI deletes recordings.
"""

import logging
import httpx
from typing import Optional
from app.db.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)


class VAPIRecordingService:
    """
    Service to download and store VAPI recordings permanently.
    """

    def __init__(self):
        self.client = get_supabase()
        self.storage_bucket = "interview-recordings"

    async def download_and_store_recording(
        self,
        recording_url: str,
        candidate_id: str,
        call_id: str
    ) -> Optional[str]:
        """
        Download recording from VAPI and upload to Supabase Storage.

        Args:
            recording_url: VAPI temporary recording URL
            recording_url: Candidate ID for file naming
            call_id: VAPI call ID for file naming

        Returns:
            Public URL of stored recording, or None if failed
        """
        if not recording_url:
            logger.warning("No recording URL provided")
            return None

        try:
            # Download recording from VAPI
            logger.info(f"Downloading recording from VAPI: {recording_url}")

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(recording_url, follow_redirects=True)
                response.raise_for_status()
                recording_bytes = response.content

            logger.info(f"Downloaded {len(recording_bytes)} bytes")

            # Determine file extension from content type
            content_type = response.headers.get("content-type", "audio/mpeg")
            extension = self._get_extension_from_content_type(content_type)

            # Generate file path
            file_path = f"voice-screening/{candidate_id}/{call_id}{extension}"

            # Upload to Supabase Storage
            logger.info(f"Uploading to Supabase Storage: {file_path}")

            upload_result = self.client.storage.from_(self.storage_bucket).upload(
                path=file_path,
                file=recording_bytes,
                file_options={
                    "content-type": content_type,
                    "cache-control": "3600",
                    "upsert": "true"  # Overwrite if exists
                }
            )

            # Get public URL
            public_url = self.client.storage.from_(self.storage_bucket).get_public_url(file_path)

            logger.info(f"Recording stored successfully: {public_url}")
            return public_url

        except httpx.HTTPError as e:
            logger.error(f"Failed to download recording from VAPI: {e}", exc_info=True)
            return None
        except Exception as e:
            logger.error(f"Failed to store recording: {e}", exc_info=True)
            return None

    def _get_extension_from_content_type(self, content_type: str) -> str:
        """Get file extension from content type."""
        content_type_map = {
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/wav": ".wav",
            "audio/wave": ".wav",
            "audio/x-wav": ".wav",
            "audio/webm": ".webm",
            "audio/ogg": ".ogg",
            "video/mp4": ".mp4",
            "video/webm": ".webm",
        }
        return content_type_map.get(content_type.lower(), ".mp3")

    async def download_and_store_transcript(
        self,
        transcript: str,
        candidate_id: str,
        call_id: str
    ) -> Optional[str]:
        """
        Store transcript as a text file in Supabase Storage.

        Args:
            transcript: Full interview transcript
            candidate_id: Candidate ID for file naming
            call_id: VAPI call ID for file naming

        Returns:
            Public URL of stored transcript, or None if failed
        """
        if not transcript:
            logger.warning("No transcript provided")
            return None

        try:
            # Generate file path
            file_path = f"voice-screening/{candidate_id}/{call_id}_transcript.txt"

            # Upload to Supabase Storage
            logger.info(f"Uploading transcript to Supabase Storage: {file_path}")

            self.client.storage.from_(self.storage_bucket).upload(
                path=file_path,
                file=transcript.encode('utf-8'),
                file_options={
                    "content-type": "text/plain",
                    "cache-control": "3600",
                    "upsert": "true"
                }
            )

            # Get public URL
            public_url = self.client.storage.from_(self.storage_bucket).get_public_url(file_path)

            logger.info(f"Transcript stored successfully: {public_url}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to store transcript: {e}", exc_info=True)
            return None


def get_vapi_recording_service() -> VAPIRecordingService:
    """Factory function to get VAPIRecordingService instance."""
    return VAPIRecordingService()
