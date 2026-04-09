"""
Supabase Storage service for file upload and management.
"""
from typing import Optional, BinaryIO
import asyncio
import os
from datetime import datetime
from app.db.supabase_client import get_supabase
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class StorageService:
    """Service for managing file storage in Supabase Storage."""

    def __init__(self):
        self.client = get_supabase()
        self.bucket_names = {
            "resumes": "resumes",
            "job_descriptions": "job-descriptions",
            "test_papers": "test-papers",
            "answer_sheets": "answer-sheets",
            "interview_recordings": "interview-recordings"  # Video recordings
        }

    async def ensure_buckets_exist(self):
        """Create storage buckets if they don't exist. Never raises — failures are logged only."""
        try:
            # List existing buckets
            buckets = self.client.storage.list_buckets()
            existing_bucket_names = [b.name for b in buckets]

            # Create missing buckets
            for bucket_name in self.bucket_names.values():
                if bucket_name not in existing_bucket_names:
                    self.client.storage.create_bucket(
                        bucket_name,
                        options={"public": False}
                    )
                    logger.info(f"Created bucket: {bucket_name}")
        except Exception as e:
            # Non-fatal: bucket may already exist; log and continue
            logger.warning(f"Could not verify/create buckets (may already exist): {e}")

    async def upload_file(
        self,
        file_data: bytes,
        filename: str,
        bucket_type: str,
        user_id: str,
        content_type: Optional[str] = None
    ) -> dict:
        """
        Upload a file to Supabase Storage.

        Args:
            file_data: File content as bytes
            filename: Original filename
            bucket_type: Type of bucket (resumes, job_descriptions, test_papers, answer_sheets)
            user_id: User ID for organizing files
            content_type: MIME type of the file

        Returns:
            dict with file_path, file_url, and bucket info
        """
        try:
            # Get the bucket name
            bucket_name = self.bucket_names.get(bucket_type)
            if not bucket_name:
                raise ValueError(f"Invalid bucket type: {bucket_type}")

            # Create a unique file path
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            file_ext = os.path.splitext(filename)[1]
            safe_filename = f"{user_id}/{timestamp}_{filename}"

            # Upload the file — run in executor so the blocking HTTP call
            # doesn't stall the async event loop (causes ECONNRESET on large files).
            def _do_upload():
                return self.client.storage.from_(bucket_name).upload(
                    path=safe_filename,
                    file=file_data,
                    file_options={"content-type": content_type} if content_type else None
                )

            result = await asyncio.get_event_loop().run_in_executor(None, _do_upload)

            # Supabase SDK may return an error dict instead of raising
            if hasattr(result, 'json') and isinstance(result.json(), dict):
                error = result.json().get('error') or result.json().get('message')
                if error:
                    raise RuntimeError(f"Supabase storage upload error: {error}")
            logger.info(f"Storage upload result type={type(result).__name__}")

            # Always use safe_filename as the stored path — result.path from
            # the Supabase SDK includes the bucket name prefix
            # (e.g. "interview-recordings/candidate_id/file.webm"), which would
            # corrupt signed URL generation that already operates inside the bucket.
            file_path = safe_filename

            logger.info(f"Uploaded file: {file_path} to bucket: {bucket_name}")

            return {
                "file_path": file_path,
                "bucket": bucket_name,
                "filename": filename,
                "size": len(file_data)
            }

        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            raise

    async def download_file(self, bucket_type: str, file_path: str) -> bytes:
        """
        Download a file from Supabase Storage.

        Args:
            bucket_type: Type of bucket
            file_path: Path to the file in the bucket

        Returns:
            File content as bytes
        """
        try:
            bucket_name = self.bucket_names.get(bucket_type)
            if not bucket_name:
                raise ValueError(f"Invalid bucket type: {bucket_type}")

            result = self.client.storage.from_(bucket_name).download(file_path)
            return result

        except Exception as e:
            logger.error(f"Error downloading file: {e}")
            raise

    async def get_signed_url(
        self,
        bucket_type: str,
        file_path: str,
        expires_in: int = 3600
    ) -> str:
        """
        Get a signed URL for temporary file access.

        Args:
            bucket_type: Type of bucket
            file_path: Path to the file in the bucket
            expires_in: URL expiration time in seconds (default 1 hour)

        Returns:
            Signed URL string
        """
        try:
            bucket_name = self.bucket_names.get(bucket_type)
            if not bucket_name:
                raise ValueError(f"Invalid bucket type: {bucket_type}")

            result = self.client.storage.from_(bucket_name).create_signed_url(
                file_path,
                expires_in
            )

            # SDK v1 returns a dict {"signedURL": "..."},
            # SDK v2 returns a SignedURLResponse object with .signed_url attribute.
            if isinstance(result, dict):
                return (
                    result.get("signedURL")
                    or result.get("signedUrl")
                    or result.get("signed_url")
                )
            return getattr(result, "signed_url", None) or str(result)

        except Exception as e:
            logger.error(f"Error creating signed URL: {e}")
            raise

    async def delete_file(self, bucket_type: str, file_path: str) -> bool:
        """
        Delete a file from Supabase Storage.

        Args:
            bucket_type: Type of bucket
            file_path: Path to the file in the bucket

        Returns:
            True if successful
        """
        try:
            bucket_name = self.bucket_names.get(bucket_type)
            if not bucket_name:
                raise ValueError(f"Invalid bucket type: {bucket_type}")

            self.client.storage.from_(bucket_name).remove([file_path])
            logger.info(f"Deleted file: {file_path} from bucket: {bucket_name}")
            return True

        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            raise

    async def list_files(
        self,
        bucket_type: str,
        path: Optional[str] = None
    ) -> list:
        """
        List files in a bucket or path.

        Args:
            bucket_type: Type of bucket
            path: Optional path to list files from

        Returns:
            List of file metadata
        """
        try:
            bucket_name = self.bucket_names.get(bucket_type)
            if not bucket_name:
                raise ValueError(f"Invalid bucket type: {bucket_type}")

            result = self.client.storage.from_(bucket_name).list(path)
            return result

        except Exception as e:
            logger.error(f"Error listing files: {e}")
            raise


# Singleton instance
_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Get the storage service singleton."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
