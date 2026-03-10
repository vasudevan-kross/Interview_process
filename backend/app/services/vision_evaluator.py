"""
Vision-based answer evaluation for handwritten exam sheets.

Uses a vision-capable Ollama model (llava, glm-ocr, etc.) to read handwriting
directly from scanned page images, bypassing OCR quality limitations.

Model priority: llava:13b → llava-llama3 → llava:7b → glm-ocr:latest → MedAIBase/PaddleOCR-VL:0.9b
"""
import base64
import io
import logging
from typing import Any, Dict, List, Optional

try:
    import ollama
except ImportError:
    ollama = None

try:
    from PIL import Image
except ImportError:
    Image = None

from app.config import settings
from app.model_config import model_config

logger = logging.getLogger(__name__)


class VisionEvaluator:
    """Evaluates handwritten answers using a vision-capable Ollama model."""

    def __init__(self):
        self._best_model: Optional[str] = None
        self._detection_done = False

    async def get_best_vision_model(self) -> Optional[str]:
        """Detect and return the best available vision model (cached after first call)."""
        if not self._detection_done:
            self._detection_done = True
            if ollama is None:
                logger.warning("ollama package not installed — vision evaluation unavailable.")
                return None
            try:
                models_response = ollama.list()
                if isinstance(models_response, dict):
                    names = {m.get('name', '') for m in models_response.get('models', [])}
                else:
                    names = set()
                for candidate in model_config.VISION_EVAL_MODELS:
                    if candidate in names:
                        self._best_model = candidate
                        logger.info(f"Vision evaluator: selected model '{candidate}'")
                        break
                if not self._best_model:
                    logger.warning(
                        "No vision model found. For best results install llava: "
                        "`ollama pull llava:7b`"
                    )
            except Exception as e:
                logger.warning(f"Could not detect vision models: {e}")
        return self._best_model

    def assess_ocr_quality(self, text: str) -> float:
        """
        Score OCR output quality (0.0 = garbage, 1.0 = clean).

        Returns a value below settings.VISION_EVAL_OCR_QUALITY_THRESHOLD when
        the text is too poor to evaluate reliably via the text path alone.
        """
        if not text or len(text.strip()) < 15:
            return 0.0

        total = len(text)
        alnum = sum(c.isalnum() or c.isspace() for c in text)
        special = total - alnum

        alnum_ratio = alnum / total
        special_ratio = special / total

        if special_ratio > 0.5 or alnum_ratio < 0.4:
            return 0.1

        # Boost score for text that looks like code
        code_indicators = [
            'def ', 'class ', 'for ', 'while ', 'return ',
            'import ', 'public ', 'void ', 'function ', 'print(',
        ]
        if any(ind in text for ind in code_indicators) and alnum_ratio > 0.6:
            return 0.9

        return alnum_ratio

    def _resize_for_vision(self, img_bytes: bytes, max_width: int = 1024) -> bytes:
        """Resize image so the longest dimension is at most max_width pixels."""
        if Image is None:
            return img_bytes
        try:
            img = Image.open(io.BytesIO(img_bytes))
            if img.width > max_width:
                ratio = max_width / img.width
                new_size = (max_width, int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            return buf.getvalue()
        except Exception as e:
            logger.warning(f"Image resize failed, using original: {e}")
            return img_bytes

    async def evaluate(
        self,
        question: str,
        correct_answer: str,
        max_marks: float,
        page_images: List[bytes],
        ocr_hint: str = "",
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Evaluate a handwritten answer directly from page images.

        Args:
            question: The exam question text.
            correct_answer: Reference/expected answer.
            max_marks: Maximum marks for this question.
            page_images: List of raw PNG bytes, one per scanned page.
            ocr_hint: OCR-extracted text (may be inaccurate) used as a supplement.
            model: Optional model override; auto-detected if None.

        Returns:
            dict with marks_awarded, percentage, feedback, reasoning, similarity_score,
            read_from='vision'.
        """
        if ollama is None:
            raise RuntimeError("ollama package not installed")

        vision_model = model or await self.get_best_vision_model()
        if not vision_model:
            raise RuntimeError(
                "No vision model available. "
                "Install one with: ollama pull llava:7b"
            )

        images_b64 = [
            base64.b64encode(self._resize_for_vision(img)).decode('utf-8')
            for img in page_images
        ]

        prompt = f"""You are an expert examiner evaluating a handwritten exam answer.
Look at the attached scanned page image(s) of the student's answer sheet.

QUESTION: {question}

EXPECTED ANSWER (reference):
{correct_answer[:800]}

MAXIMUM MARKS: {max_marks}

OCR HINT (may be inaccurate — use only as a supplement to what you see):
{ocr_hint[:400] if ocr_hint else "Not available"}

Instructions:
- Read the handwriting directly from the image(s)
- Focus on logical correctness, not neatness or minor syntax issues
- Award near-full marks if the logic/algorithm is correct, even with minor syntax errors
- Return ONLY the following JSON, no extra text:
{{
  "marks_awarded": <number 0 to {max_marks}>,
  "feedback": "<one concise sentence>",
  "reasoning": "<brief explanation of the score>",
  "read_from": "vision"
}}"""

        response = ollama.generate(
            model=vision_model,
            prompt=prompt,
            images=images_b64,
            options={"temperature": 0.1, "seed": 42},
        )
        text = response.get('response', '')

        # Use the robust JSON extractor from test_evaluation
        from app.services.test_evaluation import extract_json_from_text
        result = extract_json_from_text(text) or {}

        try:
            marks = float(result.get('marks_awarded', 0))
        except (TypeError, ValueError):
            marks = 0.0
        marks = max(0.0, min(float(max_marks), marks))

        return {
            'marks_awarded': marks,
            'percentage': (marks / float(max_marks) * 100) if max_marks else 0.0,
            'feedback': result.get('feedback', ''),
            'reasoning': result.get('reasoning', ''),
            'similarity_score': marks / float(max_marks) if max_marks else 0.0,
            'read_from': 'vision',
        }


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_vision_evaluator: Optional[VisionEvaluator] = None


def get_vision_evaluator() -> VisionEvaluator:
    """Return the shared VisionEvaluator instance."""
    global _vision_evaluator
    if _vision_evaluator is None:
        _vision_evaluator = VisionEvaluator()
    return _vision_evaluator
