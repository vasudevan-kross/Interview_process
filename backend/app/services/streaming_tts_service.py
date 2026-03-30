import asyncio
import re
from dataclasses import dataclass
from typing import AsyncGenerator
import logging

from app.services.audio_processing_service import build_wav_header
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class TTSChunk:
    audio: bytes
    text: str
    word_end: float = 0.0
    is_final: bool = False


class StreamingTTSService:
    def __init__(
        self,
        model_path: str | None = None,
        piper_binary: str | None = None,
        sample_rate: int = 16000,
    ):
        self.model_path = model_path or settings.TTS_PIPER_MODEL
        self.piper_binary = piper_binary or settings.TTS_PIPER_BIN
        self.config_path = settings.TTS_PIPER_CONFIG
        self.sample_rate = sample_rate

    def _split_sentences(self, text: str) -> list[str]:
        """Split text into sentences for per-sentence TTS.

        Hard splits on . ! ?
        Soft splits on , when the accumulated sentence has 10+ words before the comma.
        """
        text = text.strip()
        if not text:
            return []

        # Hard split on sentence-ending punctuation
        parts = re.split(r"(?<=[.!?])\s+", text)
        result = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            # Soft comma split: if 10+ words before a comma, split there
            comma_parts = part.split(",")
            accumulated = ""
            for i, segment in enumerate(comma_parts):
                if i == len(comma_parts) - 1:
                    # Last segment — append and flush
                    accumulated += segment
                    result.append(accumulated.strip())
                    accumulated = ""
                else:
                    candidate = accumulated + segment + ","
                    word_count = len(candidate.split())
                    if word_count >= 10:
                        result.append(candidate.strip())
                        accumulated = ""
                    else:
                        accumulated = candidate
            if accumulated.strip():
                result.append(accumulated.strip())
        return [s for s in result if s]

    async def _synthesize_sentence(self, sentence: str) -> bytes:
        """Run Piper on a single sentence, return raw PCM bytes."""
        cmd = [self.piper_binary, "--model", self.model_path, "--output-raw"]
        if self.config_path:
            cmd += ["--config", self.config_path]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        pcm_bytes, stderr_bytes = await proc.communicate(sentence.encode("utf-8"))
        if proc.returncode != 0:
            raise RuntimeError(stderr_bytes.decode(errors="replace").strip())
        return pcm_bytes

    async def stream_synthesize(self, text: str) -> AsyncGenerator[TTSChunk, None]:
        """Yield one TTSChunk per sentence, then a final sentinel chunk."""
        sentences = self._split_sentences(text)
        if not sentences:
            # Single chunk for unsplit text
            sentences = [text.strip()]

        for sentence in sentences:
            try:
                pcm_bytes = await self._synthesize_sentence(sentence)
                if pcm_bytes:
                    wav_bytes = build_wav_header(pcm_bytes) + pcm_bytes
                    yield TTSChunk(audio=wav_bytes, text=sentence, word_end=0.0, is_final=False)
            except Exception as e:
                logger.error("TTS synthesis failed for sentence %r: %s", sentence, e)

        yield TTSChunk(audio=b"", text="", word_end=0.0, is_final=True)

    async def synthesize_to_file(self, text: str, output_path: str) -> None:
        """Synthesize full text to a WAV file (used by non-WS flows)."""
        all_pcm = b""
        async for chunk in self.stream_synthesize(text):
            if not chunk.is_final and chunk.audio:
                # Strip WAV header from each chunk to get raw PCM
                all_pcm += chunk.audio[44:]
        if all_pcm:
            import aiofiles
            async with aiofiles.open(output_path, "wb") as f:
                await f.write(build_wav_header(all_pcm) + all_pcm)


_streaming_tts_service: StreamingTTSService | None = None


def get_streaming_tts_service() -> StreamingTTSService:
    global _streaming_tts_service
    if _streaming_tts_service is None:
        _streaming_tts_service = StreamingTTSService()
    return _streaming_tts_service
