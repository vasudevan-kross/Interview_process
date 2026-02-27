"""
TrOCR (Transformer-based OCR) service for handwriting recognition.
Uses Microsoft's TrOCR model - completely free and runs locally.
Provides 75-85% accuracy on handwritten text.
"""
import io
import os
import logging
from typing import Optional, Dict
from PIL import Image
import torch

logger = logging.getLogger(__name__)


class TrOCRService:
    """Service for extracting text from handwritten images using TrOCR."""

    def __init__(self):
        """Initialize TrOCR service."""
        self.processor = None
        self.model = None
        self.device = None
        self.enabled = False
        self._initialize_model()

    def _initialize_model(self):
        """Initialize TrOCR model and processor."""
        try:
            # Check if TrOCR is enabled
            enabled = os.getenv("TROCR_ENABLED", "true").lower() == "true"
            if not enabled:
                logger.info("TrOCR is disabled (TROCR_ENABLED=false)")
                return

            # Import required libraries
            try:
                from transformers import TrOCRProcessor, VisionEncoderDecoderModel
            except ImportError:
                logger.error(
                    "TrOCR dependencies not installed. "
                    "Run: pip install transformers torch torchvision"
                )
                return

            # Set device (GPU or CPU)
            device_preference = os.getenv("TROCR_DEVICE", "cpu").lower()
            if device_preference == "cuda" and torch.cuda.is_available():
                self.device = torch.device("cuda")
                logger.info("✅ TrOCR using GPU acceleration")
            else:
                self.device = torch.device("cpu")
                logger.info("TrOCR using CPU (slower, consider GPU for faster processing)")

            # Load model
            model_name = os.getenv(
                "TROCR_MODEL",
                "microsoft/trocr-large-handwritten"
            )

            logger.info(f"Loading TrOCR model: {model_name}")
            logger.info("First-time model download: ~1.4GB (cached for future use)")

            self.processor = TrOCRProcessor.from_pretrained(model_name)
            self.model = VisionEncoderDecoderModel.from_pretrained(model_name)
            self.model.to(self.device)
            self.model.eval()  # Set to evaluation mode

            self.enabled = True
            logger.info("✅ TrOCR initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize TrOCR: {e}")
            logger.error(
                "TrOCR initialization failed. Make sure you have installed: "
                "pip install transformers torch torchvision"
            )
            self.enabled = False

    async def extract_text_from_image(
        self,
        image_data: bytes,
        preprocess: bool = True
    ) -> Dict[str, any]:
        """
        Extract text from a handwritten image using TrOCR.

        Args:
            image_data: Image content as bytes
            preprocess: Apply preprocessing for better accuracy

        Returns:
            dict with extracted_text, method, etc.
        """
        if not self.enabled or not self.model:
            raise RuntimeError(
                "TrOCR is not enabled. "
                "Ensure dependencies are installed: pip install transformers torch torchvision"
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

            # Process image with TrOCR
            pixel_values = self.processor(
                image,
                return_tensors="pt"
            ).pixel_values.to(self.device)

            # Generate text
            with torch.no_grad():
                generated_ids = self.model.generate(pixel_values)

            # Decode generated text
            extracted_text = self.processor.batch_decode(
                generated_ids,
                skip_special_tokens=True
            )[0]

            logger.info(
                f"TrOCR extracted {len(extracted_text)} characters from handwritten image"
            )

            return {
                "extracted_text": extracted_text,
                "char_count": len(extracted_text),
                "word_count": len(extracted_text.split()),
                "method": "TrOCR (Microsoft Transformer-based Handwriting OCR)",
                "ocr_used": True,
                "device": str(self.device)
            }

        except Exception as e:
            logger.error(f"TrOCR extraction failed: {e}")
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

            # Convert to grayscale
            if image.mode != 'L':
                image = ImageOps.grayscale(image)
                image = image.convert('RGB')  # TrOCR expects RGB

            # Enhance contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.5)

            # Enhance sharpness
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.3)

            return image

        except Exception as e:
            logger.warning(f"Image preprocessing failed: {e}. Using original image.")
            return image

    def is_available(self) -> bool:
        """Check if TrOCR is available."""
        return self.enabled and self.model is not None


# Singleton instance
_trocr_service: Optional[TrOCRService] = None


def get_trocr_service() -> TrOCRService:
    """Get the TrOCR service singleton."""
    global _trocr_service
    if _trocr_service is None:
        _trocr_service = TrOCRService()
    return _trocr_service
