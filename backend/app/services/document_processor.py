"""
Document processing service for extracting text from various file formats.
Supports PDF, DOCX, plain text, and images (with OCR).
"""
from typing import Dict, Optional
import io
import logging
from pathlib import Path

# Document processing libraries
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from docx import Document as DocxDocument
except ImportError:
    DocxDocument = None

try:
    from PIL import Image
    import pytesseract
except ImportError:
    Image = None
    pytesseract = None

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Service for processing and extracting text from documents."""

    SUPPORTED_FORMATS = {
        'pdf': ['.pdf'],
        'docx': ['.docx', '.doc'],
        'text': ['.txt'],
        'image': ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']
    }

    def __init__(self):
        """Initialize the document processor."""
        self._check_dependencies()

    def _check_dependencies(self):
        """Check if required libraries are available."""
        if pdfplumber is None:
            logger.warning("pdfplumber not installed. PDF processing will fail.")
        if DocxDocument is None:
            logger.warning("python-docx not installed. DOCX processing will fail.")
        if Image is None or pytesseract is None:
            logger.warning("PIL or pytesseract not installed. OCR will fail.")

    def get_file_type(self, filename: str) -> Optional[str]:
        """
        Determine file type from filename extension.

        Args:
            filename: Name of the file

        Returns:
            File type (pdf, docx, text, image) or None if unsupported
        """
        ext = Path(filename).suffix.lower()
        for file_type, extensions in self.SUPPORTED_FORMATS.items():
            if ext in extensions:
                return file_type
        return None

    async def extract_text(
        self,
        file_data: bytes,
        filename: str,
        file_type: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Extract text from a document.

        Args:
            file_data: File content as bytes
            filename: Original filename
            file_type: Optional file type override

        Returns:
            dict with extracted_text, page_count, metadata
        """
        try:
            # Determine file type
            if file_type is None:
                file_type = self.get_file_type(filename)

            if file_type is None:
                raise ValueError(f"Unsupported file format: {filename}")

            # Extract text based on file type
            if file_type == 'pdf':
                return await self._extract_from_pdf(file_data)
            elif file_type == 'docx':
                return await self._extract_from_docx(file_data)
            elif file_type == 'text':
                return await self._extract_from_text(file_data)
            elif file_type == 'image':
                return await self._extract_from_image(file_data)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

        except Exception as e:
            logger.error(f"Error extracting text from {filename}: {e}")
            raise

    async def _extract_from_pdf(self, file_data: bytes) -> Dict[str, any]:
        """Extract text from PDF using pdfplumber."""
        if pdfplumber is None:
            raise RuntimeError("pdfplumber is not installed")

        try:
            text_content = []
            page_count = 0

            with pdfplumber.open(io.BytesIO(file_data)) as pdf:
                page_count = len(pdf.pages)

                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_content.append(page_text)

            extracted_text = "\n\n".join(text_content)

            return {
                "extracted_text": extracted_text,
                "page_count": page_count,
                "char_count": len(extracted_text),
                "word_count": len(extracted_text.split()),
                "format": "pdf"
            }

        except Exception as e:
            logger.error(f"Error extracting PDF: {e}")
            raise

    async def _extract_from_docx(self, file_data: bytes) -> Dict[str, any]:
        """Extract text from DOCX using python-docx."""
        if DocxDocument is None:
            raise RuntimeError("python-docx is not installed")

        try:
            doc = DocxDocument(io.BytesIO(file_data))

            # Extract text from paragraphs
            text_content = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_content.append(paragraph.text)

            # Extract text from tables
            for table in doc.tables:
                for row in table.rows:
                    row_text = ' | '.join(cell.text for cell in row.cells)
                    if row_text.strip():
                        text_content.append(row_text)

            extracted_text = "\n".join(text_content)

            return {
                "extracted_text": extracted_text,
                "page_count": len(doc.sections) if hasattr(doc, 'sections') else 1,
                "char_count": len(extracted_text),
                "word_count": len(extracted_text.split()),
                "format": "docx"
            }

        except Exception as e:
            logger.error(f"Error extracting DOCX: {e}")
            raise

    async def _extract_from_text(self, file_data: bytes) -> Dict[str, any]:
        """Extract text from plain text file."""
        try:
            # Try different encodings
            encodings = ['utf-8', 'latin-1', 'cp1252']
            extracted_text = None

            for encoding in encodings:
                try:
                    extracted_text = file_data.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue

            if extracted_text is None:
                raise ValueError("Could not decode text file with any supported encoding")

            return {
                "extracted_text": extracted_text,
                "page_count": 1,
                "char_count": len(extracted_text),
                "word_count": len(extracted_text.split()),
                "format": "text"
            }

        except Exception as e:
            logger.error(f"Error extracting text: {e}")
            raise

    async def _extract_from_image(self, file_data: bytes) -> Dict[str, any]:
        """Extract text from image using OCR (pytesseract)."""
        if Image is None or pytesseract is None:
            raise RuntimeError("PIL or pytesseract is not installed")

        try:
            # Open image
            image = Image.open(io.BytesIO(file_data))

            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Perform OCR
            extracted_text = pytesseract.image_to_string(image)

            return {
                "extracted_text": extracted_text,
                "page_count": 1,
                "char_count": len(extracted_text),
                "word_count": len(extracted_text.split()),
                "format": "image",
                "metadata": {
                    "image_size": image.size,
                    "image_mode": image.mode
                }
            }

        except Exception as e:
            logger.error(f"Error extracting text from image: {e}")
            raise

    async def validate_file(
        self,
        file_data: bytes,
        filename: str,
        max_size: Optional[int] = None
    ) -> Dict[str, any]:
        """
        Validate a file before processing.

        Args:
            file_data: File content as bytes
            filename: Original filename
            max_size: Maximum allowed file size in bytes

        Returns:
            dict with is_valid, file_type, file_size, errors
        """
        errors = []
        file_size = len(file_data)

        # Check file type
        file_type = self.get_file_type(filename)
        if file_type is None:
            errors.append(f"Unsupported file format: {Path(filename).suffix}")

        # Check file size
        if max_size and file_size > max_size:
            errors.append(f"File size ({file_size} bytes) exceeds maximum ({max_size} bytes)")

        # Check if file is empty
        if file_size == 0:
            errors.append("File is empty")

        return {
            "is_valid": len(errors) == 0,
            "file_type": file_type,
            "file_size": file_size,
            "errors": errors
        }


# Singleton instance
_document_processor: Optional[DocumentProcessor] = None


def get_document_processor() -> DocumentProcessor:
    """Get the document processor singleton."""
    global _document_processor
    if _document_processor is None:
        _document_processor = DocumentProcessor()
    return _document_processor
