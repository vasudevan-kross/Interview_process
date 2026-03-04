"""VAPI file upload service for knowledge base integration."""

import httpx
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class VapiFileService:
    """Service for managing VAPI file uploads (knowledge base)."""

    def __init__(self):
        self.settings = get_settings()
        self.base_url = "https://api.vapi.ai"
        self.headers = {
            "Authorization": f"Bearer {self.settings.VAPI_PRIVATE_KEY}",
        }

    async def upload_file(
        self,
        file_path: str,
        file_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload a file to VAPI for knowledge base.

        Args:
            file_path: Path to the file to upload
            file_name: Optional custom name for the file

        Returns:
            Dict with file_id, name, status

        Raises:
            HTTPError if upload fails
        """
        try:
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")

            # Use provided name or file name
            name = file_name or path.name

            # Read file content
            with open(path, "rb") as f:
                files = {"file": (name, f, self._get_mime_type(path))}

                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{self.base_url}/file",
                        headers=self.headers,
                        files=files
                    )
                    response.raise_for_status()

                    result = response.json()
                    logger.info(f"✅ Uploaded file to VAPI: {name} (ID: {result.get('id')})")

                    return {
                        "file_id": result.get("id"),
                        "name": result.get("name", name),
                        "status": result.get("status", "processing")
                    }

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ VAPI file upload failed: {e.response.status_code} - {e.response.text}")
            raise Exception(f"VAPI file upload failed: {e.response.text}")
        except Exception as e:
            logger.error(f"❌ Error uploading file to VAPI: {str(e)}")
            raise

    async def upload_text_content(
        self,
        content: str,
        file_name: str = "knowledge_base.txt"
    ) -> Dict[str, Any]:
        """
        Upload text content directly to VAPI (creates a temporary file).

        Args:
            content: Text content to upload
            file_name: Name for the file

        Returns:
            Dict with file_id, name, status
        """
        try:
            # Create file-like object from string
            files = {"file": (file_name, content.encode("utf-8"), "text/plain")}

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/file",
                    headers=self.headers,
                    files=files
                )
                response.raise_for_status()

                result = response.json()
                logger.info(f"✅ Uploaded text content to VAPI: {file_name} (ID: {result.get('id')})")

                return {
                    "file_id": result.get("id"),
                    "name": result.get("name", file_name),
                    "status": result.get("status", "processing")
                }

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ VAPI text upload failed: {e.response.status_code} - {e.response.text}")
            raise Exception(f"VAPI text upload failed: {e.response.text}")
        except Exception as e:
            logger.error(f"❌ Error uploading text to VAPI: {str(e)}")
            raise

    async def get_file_status(self, file_id: str) -> Dict[str, Any]:
        """
        Get file status from VAPI.

        Args:
            file_id: VAPI file ID

        Returns:
            Dict with file details and status
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/file/{file_id}",
                    headers=self.headers
                )
                response.raise_for_status()

                return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Failed to get VAPI file status: {e.response.status_code}")
            raise Exception(f"Failed to get file status: {e.response.text}")
        except Exception as e:
            logger.error(f"❌ Error getting file status: {str(e)}")
            raise

    async def delete_file(self, file_id: str) -> bool:
        """
        Delete a file from VAPI.

        Args:
            file_id: VAPI file ID

        Returns:
            True if deleted successfully
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(
                    f"{self.base_url}/file/{file_id}",
                    headers=self.headers
                )
                response.raise_for_status()

                logger.info(f"✅ Deleted file from VAPI: {file_id}")
                return True

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Failed to delete VAPI file: {e.response.status_code}")
            return False
        except Exception as e:
            logger.error(f"❌ Error deleting file: {str(e)}")
            return False

    async def list_files(self) -> List[Dict[str, Any]]:
        """
        List all files uploaded to VAPI.

        Returns:
            List of file dictionaries
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/file",
                    headers=self.headers
                )
                response.raise_for_status()

                return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Failed to list VAPI files: {e.response.status_code}")
            return []
        except Exception as e:
            logger.error(f"❌ Error listing files: {str(e)}")
            return []

    def _get_mime_type(self, path: Path) -> str:
        """Get MIME type based on file extension."""
        extension = path.suffix.lower()
        mime_types = {
            ".txt": "text/plain",
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".doc": "application/msword",
            ".md": "text/markdown",
            ".csv": "text/csv",
            ".json": "application/json",
        }
        return mime_types.get(extension, "application/octet-stream")


# Singleton instance
_vapi_file_service: Optional[VapiFileService] = None


def get_vapi_file_service() -> VapiFileService:
    """Get or create VapiFileService singleton."""
    global _vapi_file_service
    if _vapi_file_service is None:
        _vapi_file_service = VapiFileService()
    return _vapi_file_service
