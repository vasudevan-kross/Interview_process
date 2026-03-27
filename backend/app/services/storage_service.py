"""
Supabase Storage service for file upload and management.
"""
from typing import Optional, BinaryIO
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
            "interview_recordings": "interview-recordings",  # Video recordings
            "coding_videos": "coding-videos",  # Video proctoring for coding interviews
        }

    async def ensure_buckets_exist(self):
        """Create storage buckets if they don't exist."""
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
            logger.error(f"Error ensuring buckets exist: {e}")
            raise

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

            # Upload the file
            result = self.client.storage.from_(bucket_name).upload(
                path=safe_filename,
                file=file_data,
                file_options={"content-type": content_type} if content_type else None
            )

            # Get the public URL (even though bucket is private, we can get a signed URL later)
            file_path = result.path if hasattr(result, 'path') else safe_filename

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

            return result.get("signedURL") if isinstance(result, dict) else result

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
