"""
Video Proctoring Service for Coding Interview assessments.
Handles session creation, chunked webcam/screen upload, finalization.
"""
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional

from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

CODING_VIDEOS_BUCKET = "coding-videos"


class VideoProctoringService:
    def __init__(self):
        self.client = get_supabase()

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def create_session(self, submission_id: str, org_id: str, browser_info: str = "", is_mobile: bool = False) -> dict:
        """Create a video proctoring session linked to a submission."""
        result = self.client.table("video_proctoring_sessions").insert({
            "submission_id": submission_id,
            "org_id": org_id,
            "browser_info": browser_info,
            "is_mobile": is_mobile,
            "webcam_upload_status": "pending",
            "screen_upload_status": "pending" if not is_mobile else "completed",  # No screen on mobile
            "recording_started_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        if not result.data:
            raise RuntimeError("Failed to create video proctoring session")

        session = result.data[0]

        # Link the session back to the submission
        self.client.table("coding_submissions").update({
            "video_session_id": session["id"]
        }).eq("id", submission_id).execute()

        logger.info(f"Created video proctoring session {session['id']} for submission {submission_id}")
        return session

    def finalize_session(self, session_id: str, metadata: dict) -> dict:
        """Mark session as finalized when recording stops."""
        update_data = {
            "recording_ended_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if "webcam_duration" in metadata:
            update_data["webcam_duration_seconds"] = metadata["webcam_duration"]
        if "screen_duration" in metadata:
            update_data["screen_duration_seconds"] = metadata["screen_duration"]

        result = self.client.table("video_proctoring_sessions").update(
            update_data
        ).eq("id", session_id).execute()

        logger.info(f"Finalized video proctoring session {session_id}")
        return result.data[0] if result.data else {}

    # ------------------------------------------------------------------
    # Chunk uploads (webcam + screen)
    # ------------------------------------------------------------------

    def upload_webcam_chunk(self, session_id: str, chunk_data: bytes, sequence: int) -> dict:
        """Upload a webcam recording chunk to Supabase Storage."""
        path = f"{session_id}/webcam/chunk-{sequence:04d}.webm"
        try:
            self.client.storage.from_(CODING_VIDEOS_BUCKET).upload(
                path=path,
                file=chunk_data,
                file_options={"content-type": "video/webm", "upsert": "true"},
            )

            # Increment chunk count and mark as uploading
            self.client.table("video_proctoring_sessions").update({
                "webcam_upload_status": "uploading",
                "webcam_chunk_count": sequence + 1,
                "webcam_storage_path": f"{session_id}/webcam/",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", session_id).execute()

            logger.debug(f"Uploaded webcam chunk {sequence} for session {session_id}")
            return {"status": "ok", "path": path}

        except Exception as e:
            logger.error(f"Failed to upload webcam chunk {sequence} for session {session_id}: {e}")
            raise

    def upload_screen_chunk(self, session_id: str, chunk_data: bytes, sequence: int) -> dict:
        """Upload a screen recording chunk to Supabase Storage."""
        path = f"{session_id}/screen/chunk-{sequence:04d}.webm"
        try:
            self.client.storage.from_(CODING_VIDEOS_BUCKET).upload(
                path=path,
                file=chunk_data,
                file_options={"content-type": "video/webm", "upsert": "true"},
            )

            self.client.table("video_proctoring_sessions").update({
                "screen_upload_status": "uploading",
                "screen_chunk_count": sequence + 1,
                "screen_storage_path": f"{session_id}/screen/",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", session_id).execute()

            logger.debug(f"Uploaded screen chunk {sequence} for session {session_id}")
            return {"status": "ok", "path": path}

        except Exception as e:
            logger.error(f"Failed to upload screen chunk {sequence} for session {session_id}: {e}")
            raise

    def mark_upload_complete(self, session_id: str, stream_type: str) -> None:
        """Mark webcam or screen upload as completed."""
        field = f"{stream_type}_upload_status"
        ts_field = f"{stream_type}_uploaded_at"
        self.client.table("video_proctoring_sessions").update({
            field: "completed",
            ts_field: datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", session_id).execute()

    # ------------------------------------------------------------------
    # Face detection event logging
    # ------------------------------------------------------------------

    def log_face_event(self, session_id: str, event_type: str, timestamp: str) -> dict:
        """Append a face detection event to the session record."""
        # Fetch current events
        result = self.client.table("video_proctoring_sessions").select(
            "face_absence_events, multiple_faces_events"
        ).eq("id", session_id).execute()

        if not result.data:
            raise ValueError(f"Session {session_id} not found")

        session = result.data[0]
        event = {"timestamp": timestamp}

        if event_type == "face_absent":
            events = session.get("face_absence_events") or []
            events.append(event)
            self.client.table("video_proctoring_sessions").update({
                "face_absence_events": events,
                "face_detection_enabled": True,
            }).eq("id", session_id).execute()
        elif event_type == "multiple_faces":
            events = session.get("multiple_faces_events") or []
            events.append(event)
            self.client.table("video_proctoring_sessions").update({
                "multiple_faces_events": events,
                "face_detection_enabled": True,
            }).eq("id", session_id).execute()

        return {"status": "logged"}

    # ------------------------------------------------------------------
    # Playback URL generation
    # ------------------------------------------------------------------

    def get_signed_urls(self, session_id: str, expires_in: int = 3600) -> dict:
        """Generate signed playback URLs for webcam and screen recordings."""
        result = self.client.table("video_proctoring_sessions").select("*").eq("id", session_id).execute()
        if not result.data:
            raise ValueError(f"Session {session_id} not found")

        session = result.data[0]
        urls: dict = {"session_id": session_id, "webcam_url": None, "screen_url": None}

        webcam_path = session.get("webcam_storage_path")
        screen_path = session.get("screen_storage_path")

        if webcam_path and session.get("webcam_upload_status") == "completed":
            # List chunks and build URLs for each
            try:
                chunks = self.client.storage.from_(CODING_VIDEOS_BUCKET).list(webcam_path.rstrip("/"))
                if chunks:
                    chunk_urls = []
                    for chunk in sorted(chunks, key=lambda c: c.get("name", "")):
                        chunk_full_path = f"{webcam_path.rstrip('/')}/{chunk['name']}"
                        signed = self.client.storage.from_(CODING_VIDEOS_BUCKET).create_signed_url(
                            chunk_full_path, expires_in
                        )
                        if signed and signed.get("signedURL"):
                            chunk_urls.append(signed["signedURL"])
                    urls["webcam_chunks"] = chunk_urls
                    urls["webcam_chunk_count"] = len(chunk_urls)
            except Exception as e:
                logger.error(f"Error getting webcam signed URLs: {e}")

        if screen_path and session.get("screen_upload_status") == "completed":
            try:
                chunks = self.client.storage.from_(CODING_VIDEOS_BUCKET).list(screen_path.rstrip("/"))
                if chunks:
                    chunk_urls = []
                    for chunk in sorted(chunks, key=lambda c: c.get("name", "")):
                        chunk_full_path = f"{screen_path.rstrip('/')}/{chunk['name']}"
                        signed = self.client.storage.from_(CODING_VIDEOS_BUCKET).create_signed_url(
                            chunk_full_path, expires_in
                        )
                        if signed and signed.get("signedURL"):
                            chunk_urls.append(signed["signedURL"])
                    urls["screen_chunks"] = chunk_urls
                    urls["screen_chunk_count"] = len(chunk_urls)
            except Exception as e:
                logger.error(f"Error getting screen signed URLs: {e}")

        urls["session"] = session
        return urls

    def get_session_by_submission(self, submission_id: str) -> Optional[dict]:
        """Get the video proctoring session for a given submission."""
        result = self.client.table("video_proctoring_sessions").select("*").eq(
            "submission_id", submission_id
        ).execute()
        return result.data[0] if result.data else None


# Singleton
_video_proctoring_service: Optional[VideoProctoringService] = None


def get_video_proctoring_service() -> VideoProctoringService:
    global _video_proctoring_service
    if _video_proctoring_service is None:
        _video_proctoring_service = VideoProctoringService()
    return _video_proctoring_service
