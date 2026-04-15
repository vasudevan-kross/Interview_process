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
        # Use float16 for CUDA if not explicitly set to something else
        if device == "cuda" and compute_type == "int8":
            actual_compute_type = "float16"
        else:
            actual_compute_type = compute_type

        model_size = settings.STT_MODEL_SIZE
        print(f"\n--- STT CONFIGURATION ---")
        print(f"Model: {model_size}")
        print(f"Device: {device}")
        print(f"Compute: {actual_compute_type}")
        print(f"-------------------------\n")
        
        logger.info(f"Loading STT Model: {model_size} on {device} ({actual_compute_type})")

        return WhisperModel(
            model_size,
            device=device,
            compute_type=actual_compute_type,
        )

    def transcribe(self, wav_bytes: bytes, initial_prompt: Optional[str] = None) -> str:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(wav_bytes)
            tmp.flush()
            path = tmp.name

        language = settings.STT_LANGUAGE or None
        try:
            # Increased beam_size to 7 for better technical accuracy
            segments, _ = self.model.transcribe(
                path, 
                beam_size=7, 
                language=language, 
                initial_prompt=initial_prompt,
                vad_filter=True, # Added VAD filter for cleaner segments
                vad_parameters=dict(min_silence_duration_ms=500)
            )
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
                    path, beam_size=5, language=language, initial_prompt=initial_prompt
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
