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

        logger.info(f"Running TTS command: {' '.join(cmd)}")
        try:
            result = subprocess.run(
                cmd, 
                input=text.encode("utf-8"), 
                capture_output=True,
                check=True
            )
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                 logger.error(f"TTS output file is empty or missing: {output_path}")
                 raise ValueError("TTS generated empty audio")

            with open(output_path, "rb") as f:
                data = f.read()
                logger.info(f"Successfully synthesized {len(data)} bytes of audio.")
                return data, "audio/wav"
        except subprocess.CalledProcessError as exc:
            logger.error(f"Piper TTS failed with exit code {exc.returncode}")
            logger.error(f"Stderr: {exc.stderr.decode('utf-8') if exc.stderr else 'None'}")
            raise
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
