"""Audio processing helpers for VAD and conversion."""

from __future__ import annotations

import logging
import shutil
import struct
import subprocess
import tempfile
from typing import Optional

import math

from app.config import settings

logger = logging.getLogger(__name__)


def build_wav_header(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    """Build a 44-byte RIFF/PCM WAV header for mono 16-bit audio at sample_rate."""
    data_size = len(pcm_bytes)
    chunk_size = 36 + data_size
    byte_rate = sample_rate * 2   # mono 16-bit: 1 channel × 2 bytes/sample
    return struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",        # ChunkID
        chunk_size,     # ChunkSize
        b"WAVE",        # Format
        b"fmt ",        # Subchunk1ID
        16,             # Subchunk1Size (PCM)
        1,              # AudioFormat (PCM = 1)
        1,              # NumChannels (mono)
        sample_rate,    # SampleRate
        byte_rate,      # ByteRate
        2,              # BlockAlign
        16,             # BitsPerSample
        b"data",        # Subchunk2ID
        data_size,      # Subchunk2Size
    )


class AudioProcessingService:
    def __init__(self, sample_rate: int = 16000) -> None:
        self.sample_rate = sample_rate
        self.ffmpeg_path = settings.FFMPEG_PATH or shutil.which("ffmpeg")
        if not self.ffmpeg_path:
            logger.warning("ffmpeg not found in PATH; audio conversion will fail")
        self.vad = None
        try:
            import sys
            try:
                import pkg_resources
            except ImportError:
                # Mock pkg_resources for webrtcvad which uses it only to get __version__
                import types
                _pkg = types.ModuleType("pkg_resources")
                class _MockDist:
                    version = "2.0.10"
                _pkg.get_distribution = lambda name: _MockDist()
                sys.modules["pkg_resources"] = _pkg

            import webrtcvad  # type: ignore

            self.vad = webrtcvad.Vad(2)
        except Exception as exc:
            logger.warning(f"WebRTC VAD unavailable, using energy VAD: {exc}")

    def convert_to_wav16k(self, audio_bytes: bytes, input_ext: str) -> bytes:
        """Convert audio bytes to 16kHz mono WAV using ffmpeg."""
        if not self.ffmpeg_path:
            raise ValueError(
                "ffmpeg not found in PATH. Install ffmpeg and restart the backend."
            )
        with tempfile.NamedTemporaryFile(suffix=input_ext, delete=False) as src:
            src.write(audio_bytes)
            src.flush()
            src_path = src.name

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as dst:
            dst_path = dst.name

        cmd = [
            self.ffmpeg_path,
            "-y",
            "-i",
            src_path,
            "-ac",
            "1",
            "-ar",
            str(self.sample_rate),
            "-f",
            "wav",
            dst_path,
        ]

        try:
            subprocess.run(
                cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            with open(dst_path, "rb") as f:
                return f.read()
        except FileNotFoundError as exc:
            raise ValueError(
                "ffmpeg not found in PATH. Install ffmpeg and restart the backend."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise ValueError("Failed to convert audio with ffmpeg.") from exc
        finally:
            try:
                import os

                for path in (src_path, dst_path):
                    if os.path.exists(path):
                        os.remove(path)
            except Exception:
                pass

    def has_speech(self, wav_bytes: bytes, frame_ms: int = 20) -> bool:
        """Return True if speech is detected in WAV bytes."""
        audio = self._extract_pcm(wav_bytes)
        if not audio:
            return False

        # Reset transient VAD state for this specific check
        self.noise_floor = None
        self.speech_frames = 0

        frame_size = int(self.sample_rate * frame_ms / 1000) * 2
        for i in range(0, len(audio), frame_size):
            frame = audio[i : i + frame_size]
            if len(frame) < frame_size:
                continue
            if self.vad:
                if self.vad.is_speech(frame, self.sample_rate):
                    return True
            else:
                if self._energy_vad(frame):
                    return True
        return False

    def _energy_vad(self, frame: bytes) -> bool:
        if not frame:
            return False

        # amplify low الصوت
        def amplify(f: bytes, gain: float) -> bytes:
            amplified_samples = bytearray()
            for i in range(0, len(f), 2):
                sample = int.from_bytes(f[i:i+2], "little", signed=True)
                val = max(-32768, min(32767, int(sample * gain)))
                amplified_samples.extend(val.to_bytes(2, "little", signed=True))
            return bytes(amplified_samples)

        frame = amplify(frame, gain=2.0)

        count = len(frame) // 2
        total = 0.0

        samples = []
        for i in range(0, len(frame), 2):
            sample = int.from_bytes(frame[i:i+2], "little", signed=True)
            samples.append(sample)
            total += sample * sample

        if count == 0:
            return False

        rms = math.sqrt(total / count) / 32768.0

        # adaptive noise floor
        if getattr(self, "noise_floor", None) is None:
            self.noise_floor = rms if rms > 0 else 0.0

        self.noise_floor = 0.95 * self.noise_floor + 0.05 * rms
        threshold = self.noise_floor * 2.5

        # zero crossing
        crossings = sum(
            1 for i in range(1, len(samples))
            if samples[i-1] * samples[i] < 0
        )
        zcr = crossings / max(1, len(samples))

        is_speech = rms > threshold or zcr > 0.1

        # hangover
        if getattr(self, "speech_frames", None) is None:
            self.speech_frames = 0

        if is_speech:
            self.speech_frames = 75  # 1.5s hangover (at 20ms/frame)
            return True
        else:
            if self.speech_frames > 0:
                self.speech_frames -= 1
                return True
            return False

    def _extract_pcm(self, wav_bytes: bytes) -> bytes:
        """Extract raw PCM from WAV bytes (skip header)."""
        if len(wav_bytes) <= 44:
            return b""
        return wav_bytes[44:]


_audio_processing_service: Optional[AudioProcessingService] = None


def get_audio_processing_service() -> AudioProcessingService:
    global _audio_processing_service
    if _audio_processing_service is None:
        _audio_processing_service = AudioProcessingService()
    return _audio_processing_service
