"""Local STT service using faster-whisper."""

from __future__ import annotations

import logging
import tempfile
from typing import Optional

from faster_whisper import WhisperModel

from app.config import settings

logger = logging.getLogger(__name__)


class STTService:
    def __init__(self) -> None:
        self.device = settings.STT_DEVICE
        self.compute_type = settings.STT_COMPUTE_TYPE
        self.model = self._load_model(self.device, self.compute_type)

    def _load_model(self, device: str, compute_type: str) -> WhisperModel:
        return WhisperModel(
            settings.STT_MODEL_SIZE,
            device=device,
            compute_type=compute_type,
        )

    def transcribe(self, wav_bytes: bytes) -> str:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(wav_bytes)
            tmp.flush()
            path = tmp.name

        language = settings.STT_LANGUAGE or None
        try:
            segments, _ = self.model.transcribe(path, beam_size=5, language=language)
            text = "".join(segment.text for segment in segments).strip()
            return text
        except Exception as exc:
            message = str(exc)
            if "cublas64_12.dll" in message and self.device != "cpu":
                logger.warning("CUDA STT failed; falling back to CPU")
                self.device = "cpu"
                self.compute_type = "int8"
                self.model = self._load_model(self.device, self.compute_type)
                segments, _ = self.model.transcribe(
                    path, beam_size=5, language=language
                )
                text = "".join(segment.text for segment in segments).strip()
                return text
            raise


_stt_service: Optional[STTService] = None


def get_stt_service() -> STTService:
    global _stt_service
    if _stt_service is None:
        _stt_service = STTService()
    return _stt_service
