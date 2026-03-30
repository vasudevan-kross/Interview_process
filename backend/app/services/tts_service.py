"""Local TTS service using Piper."""

from __future__ import annotations

import logging
import subprocess
import tempfile
from typing import Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)


class TTSService:
    def __init__(self) -> None:
        self.binary = settings.TTS_PIPER_BIN
        self.model = settings.TTS_PIPER_MODEL
        self.config = settings.TTS_PIPER_CONFIG

    def synthesize(self, text: str) -> Tuple[bytes, str]:
        if not self.model:
            raise ValueError("TTS model not configured")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            output_path = tmp.name

        cmd = [self.binary, "--model", self.model, "--output_file", output_path]
        if self.config:
            cmd.extend(["--config", self.config])

        try:
            subprocess.run(cmd, input=text.encode("utf-8"), check=True)
            with open(output_path, "rb") as f:
                return f.read(), "audio/wav"
        finally:
            try:
                import os

                if os.path.exists(output_path):
                    os.remove(output_path)
            except Exception:
                pass


_tts_service: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service
