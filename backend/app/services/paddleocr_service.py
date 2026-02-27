"""
PaddleOCR service for handwriting recognition.
Uses PaddleOCR - better for full-page handwritten documents than TrOCR.
Provides 70-80% accuracy on handwritten text, completely free and local.
"""
import io
import os
import logging
from typing import Optional, Dict, List
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)


class PaddleOCRService:
    """Service for extracting text from handwritten images using PaddleOCR."""

    def __init__(self):
        """Initialize PaddleOCR service."""
        self.ocr = None
        self.enabled = False
        self._initialize_model()

    def _initialize_model(self):
        """Initialize PaddleOCR model."""
        try:
            # Check if PaddleOCR is enabled
            enabled = os.getenv("PADDLEOCR_ENABLED", "true").lower() == "true"
            if not enabled:
                logger.info("PaddleOCR is disabled (PADDLEOCR_ENABLED=false)")
                return

            # Import PaddleOCR
            try:
                from paddleocr import PaddleOCR
            except ImportError:
                logger.error(
                    "PaddleOCR not installed. "
                    "Run: pip install paddleocr paddlepaddle"
                )
                return

            # Determine device (GPU or CPU)
            use_gpu = os.getenv("PADDLEOCR_USE_GPU", "false").lower() == "true"

            # Language configuration
            lang = os.getenv("PADDLEOCR_LANG", "en")  # en, ch, etc.

            logger.info(f"Initializing PaddleOCR - GPU: {use_gpu}, Language: {lang}")

            # Initialize PaddleOCR
            # use_angle_cls=True helps with rotated text
            # use_gpu=False for CPU mode (safe default)
            self.ocr = PaddleOCR(
                use_angle_cls=True,
                lang=lang,
                use_gpu=use_gpu,
                show_log=False  # Reduce console spam
            )

            self.enabled = True
            logger.info("✅ PaddleOCR initialized successfully")
            if use_gpu:
                logger.info("✅ PaddleOCR using GPU acceleration")
            else:
                logger.info("📄 PaddleOCR using CPU (slower, consider GPU for faster processing)")

        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            logger.error(
                "PaddleOCR initialization failed. Make sure you have installed: "
                "pip install paddleocr paddlepaddle"
            )
            self.enabled = False

    async def extract_text_from_image(
        self,
        image_data: bytes,
        preprocess: bool = True
    ) -> Dict[str, any]:
        """
        Extract text from a handwritten image using PaddleOCR.

        Args:
            image_data: Image content as bytes
            preprocess: Apply preprocessing for better accuracy

        Returns:
            dict with extracted_text, method, confidence, etc.
        """
        if not self.enabled or not self.ocr:
            raise RuntimeError(
                "PaddleOCR is not enabled. "
                "Ensure dependencies are installed: pip install paddleocr paddlepaddle"
            )

        try:
            # Open and prepare image
            image = Image.open(io.BytesIO(image_data))

            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Optional preprocessing for better results
            if preprocess:
                image = self._preprocess_image(image)

            # Convert PIL Image to numpy array for PaddleOCR
            img_array = np.array(image)

            # Perform OCR
            # Result format: [[[bbox], (text, confidence)], ...]
            result = self.ocr.ocr(img_array, cls=True)

            # Extract text and confidence
            extracted_lines = []
            total_confidence = 0.0
            count = 0

            if result and result[0]:
                for line in result[0]:
                    if line and len(line) >= 2:
                        text = line[1][0]  # Extract text
                        confidence = line[1][1]  # Extract confidence
                        extracted_lines.append(text)
                        total_confidence += confidence
                        count += 1

            # Combine all text lines
            extracted_text = "\n".join(extracted_lines)
            avg_confidence = (total_confidence / count) if count > 0 else 0.0

            logger.info(
                f"PaddleOCR extracted {len(extracted_text)} characters "
                f"({count} lines, avg confidence: {avg_confidence:.2f})"
            )

            return {
                "extracted_text": extracted_text,
                "char_count": len(extracted_text),
                "word_count": len(extracted_text.split()),
                "line_count": count,
                "avg_confidence": avg_confidence,
                "method": "PaddleOCR (Handwriting OCR)",
                "ocr_used": True
            }

        except Exception as e:
            logger.error(f"PaddleOCR extraction failed: {e}")
            raise

    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess image for better OCR accuracy.

        Args:
            image: PIL Image

        Returns:
            Preprocessed PIL Image
        """
        try:
            from PIL import ImageEnhance, ImageOps

            # Enhance contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.3)

            # Enhance sharpness
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.2)

            return image

        except Exception as e:
            logger.warning(f"Image preprocessing failed: {e}. Using original image.")
            return image

    def is_available(self) -> bool:
        """Check if PaddleOCR is available."""
        return self.enabled and self.ocr is not None


# Singleton instance
_paddleocr_service: Optional[PaddleOCRService] = None


def get_paddleocr_service() -> PaddleOCRService:
    """Get the PaddleOCR service singleton."""
    global _paddleocr_service
    if _paddleocr_service is None:
        _paddleocr_service = PaddleOCRService()
    return _paddleocr_service
