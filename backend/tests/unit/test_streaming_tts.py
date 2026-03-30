# backend/tests/unit/test_streaming_tts.py
import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.streaming_tts_service import StreamingTTSService, TTSChunk

@pytest.mark.asyncio
async def test_sentence_split_basic():
    """Three sentences produce three chunks before is_final."""
    text = "Hello there. How are you? I am fine."
    service = StreamingTTSService()

    fake_pcm = bytes(320)  # minimal raw PCM

    async def fake_subprocess(*args, **kwargs):
        proc = MagicMock()
        proc.stdout = AsyncMock()
        proc.stdout.read = AsyncMock(return_value=fake_pcm)
        proc.stdin.write = MagicMock()
        proc.stdin.close = MagicMock()
        proc.wait = AsyncMock(return_value=None)
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        chunks = [chunk async for chunk in service.stream_synthesize(text)]

    non_final = [c for c in chunks if not c.is_final]
    final = [c for c in chunks if c.is_final]

    assert len(non_final) == 3
    assert len(final) == 1
    assert final[0].audio == b""

@pytest.mark.asyncio
async def test_chunk_has_wav_header():
    """Each non-final chunk audio starts with RIFF magic."""
    service = StreamingTTSService()
    fake_pcm = bytes(320)

    async def fake_subprocess(*args, **kwargs):
        proc = MagicMock()
        proc.stdout = AsyncMock()
        proc.stdout.read = AsyncMock(return_value=fake_pcm)
        proc.stdin.write = MagicMock()
        proc.stdin.close = MagicMock()
        proc.wait = AsyncMock(return_value=None)
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        chunks = [c async for c in service.stream_synthesize("Hello world.")]

    non_final = [c for c in chunks if not c.is_final]
    assert non_final[0].audio[:4] == b"RIFF"

@pytest.mark.asyncio
async def test_word_end_is_zero():
    """word_end must be 0.0 for all chunks (unused in WS flow)."""
    service = StreamingTTSService()
    fake_pcm = bytes(320)

    async def fake_subprocess(*args, **kwargs):
        proc = MagicMock()
        proc.stdout = AsyncMock()
        proc.stdout.read = AsyncMock(return_value=fake_pcm)
        proc.stdin.write = MagicMock()
        proc.stdin.close = MagicMock()
        proc.wait = AsyncMock(return_value=None)
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_subprocess):
        chunks = [c async for c in service.stream_synthesize("Hi.")]

    assert all(c.word_end == 0.0 for c in chunks)

@pytest.mark.asyncio
async def test_comma_soft_split_after_10_words():
    """Sentence with 11 words before comma splits at the comma."""
    service = StreamingTTSService()
    # 11 words before comma
    text = "I would like to ask about your experience with distributed systems, specifically algorithms."
    sentences = service._split_sentences(text)
    assert len(sentences) >= 2
    assert sentences[0].endswith(",")
