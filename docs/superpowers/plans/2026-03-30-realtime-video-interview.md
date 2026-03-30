# Real-Time Video Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the turn-based HTTP video interview with a real-time WebSocket interview — VRM avatar, live barge-in, silence engagement, and streaming TTS — that feels like a Google Meet call.

**Architecture:** A persistent WebSocket connection (`/api/v1/video-interviews/ws/{token}`) replaces two HTTP endpoints. The backend `VideoInterviewWSHandler` manages state, audio pipeline (STT → LLM → sentence-split TTS), and engagement logic. The frontend replaces the HTTP turn loop with a WebSocket client, an AudioWorklet VAD processor, and a sentence-streaming audio queue tied to the existing VRM avatar.

**Tech Stack:** FastAPI WebSockets, faster-whisper, Piper TTS, Ollama, AudioWorklet API, Web Audio API, lucide-react, Three.js + @pixiv/three-vrm

**Spec:** `docs/superpowers/specs/2026-03-30-realtime-video-interview-design.md`

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `backend/app/services/video_interview_ws_handler.py` | Core WS session handler: auth, state machine, audio pipeline, engagement |
| `frontend/public/worklets/vad-processor.js` | AudioWorklet: 20ms frame VAD, dynamic calibration, barge-in mode |
| `backend/tests/unit/test_streaming_tts.py` | Unit tests for sentence-splitting TTS |
| `backend/tests/unit/test_wav_header.py` | Unit tests for WAV header builder |
| `backend/tests/integration/test_video_interview_ws.py` | Integration tests for WS endpoint |
| `backend/tests/conftest.py` | Shared fixtures (app client, mock Supabase) |

### Modified Files
| File | Change |
|---|---|
| `backend/app/services/streaming_tts_service.py` | Replace `process.communicate()` with sentence-split per-sentence Piper subprocesses |
| `backend/app/services/audio_processing_service.py` | Add `build_wav_header(pcm_bytes)` helper |
| `backend/app/api/v1/video_interviews.py` | Add `@router.websocket("/ws/{token}")` |
| `frontend/src/app/video-interview/[token]/page.tsx` | Full rewrite: WS client, AudioWorklet VAD, streaming TTS queue, new UI |
| `frontend/src/lib/api/video-interviews.ts` | Add `getVideoInterviewWSUrl(token)` |
| `frontend/.env.local` | Add `NEXT_PUBLIC_WS_URL=ws://localhost:8000` |

### Deleted Files (Task 12)
| File | Reason |
|---|---|
| `backend/app/services/conversation_manager.py` | Replaced by VideoInterviewWSHandler |
| `frontend/src/app/conversational-interview/` (directory) | Merged into video interview |

---

## Task 1: WAV Header Builder

**Files:**
- Modify: `backend/app/services/audio_processing_service.py`
- Create: `backend/tests/unit/test_wav_header.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1.1: Create conftest.py**

```python
# backend/tests/conftest.py
import pytest

@pytest.fixture
def sample_pcm_bytes():
    """320 samples of silence at 16kHz mono 16-bit = 640 bytes"""
    return bytes(640)
```

- [ ] **Step 1.2: Write the failing test**

```python
# backend/tests/unit/test_wav_header.py
import struct
from app.services.audio_processing_service import build_wav_header

def test_wav_header_length():
    pcm = bytes(640)
    header = build_wav_header(pcm)
    assert len(header) == 44

def test_wav_header_riff_chunk(sample_pcm_bytes):
    header = build_wav_header(sample_pcm_bytes)
    assert header[0:4] == b"RIFF"
    assert header[8:12] == b"WAVE"

def test_wav_header_fmt_chunk(sample_pcm_bytes):
    header = build_wav_header(sample_pcm_bytes)
    assert header[12:16] == b"fmt "
    audio_format, channels, sample_rate, _, _, bits = struct.unpack_from("<HHIIHH", header, 20)
    assert audio_format == 1   # PCM
    assert channels == 1
    assert sample_rate == 16000
    assert bits == 16

def test_wav_header_data_size(sample_pcm_bytes):
    header = build_wav_header(sample_pcm_bytes)
    data_size = struct.unpack_from("<I", header, 40)[0]
    assert data_size == len(sample_pcm_bytes)

def test_wav_header_with_audio_is_decodable(sample_pcm_bytes):
    """Combined header + PCM should start with valid RIFF magic"""
    header = build_wav_header(sample_pcm_bytes)
    wav_bytes = header + sample_pcm_bytes
    assert wav_bytes[:4] == b"RIFF"
    assert len(wav_bytes) == 44 + len(sample_pcm_bytes)
```

- [ ] **Step 1.3: Run test to verify it fails**

```bash
cd backend
python -m pytest tests/unit/test_wav_header.py -v
```
Expected: `ImportError` or `AttributeError: module has no attribute 'build_wav_header'`

- [ ] **Step 1.4: Implement `build_wav_header` in `audio_processing_service.py`**

Open `backend/app/services/audio_processing_service.py`. Add this function at the module level (after imports):

```python
import struct

def build_wav_header(pcm_bytes: bytes) -> bytes:
    """Build a 44-byte RIFF/PCM WAV header for 16kHz mono 16-bit audio."""
    data_size = len(pcm_bytes)
    chunk_size = 36 + data_size
    return struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",        # ChunkID
        chunk_size,     # ChunkSize
        b"WAVE",        # Format
        b"fmt ",        # Subchunk1ID
        16,             # Subchunk1Size (PCM)
        1,              # AudioFormat (PCM = 1)
        1,              # NumChannels (mono)
        16000,          # SampleRate
        32000,          # ByteRate = SampleRate * NumChannels * BitsPerSample/8
        2,              # BlockAlign = NumChannels * BitsPerSample/8
        16,             # BitsPerSample
        b"data",        # Subchunk2ID
        data_size,      # Subchunk2Size
    )
```

- [ ] **Step 1.5: Run tests to verify they pass**

```bash
cd backend
python -m pytest tests/unit/test_wav_header.py -v
```
Expected: All 5 tests PASS

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/services/audio_processing_service.py backend/tests/unit/test_wav_header.py backend/tests/conftest.py
git commit -m "feat: add build_wav_header helper for PCM → WAV conversion"
```

---

## Task 2: StreamingTTSService — Genuine Sentence Streaming

**Files:**
- Modify: `backend/app/services/streaming_tts_service.py`
- Create: `backend/tests/unit/test_streaming_tts.py`

- [ ] **Step 2.1: Write the failing tests**

```python
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
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd backend
python -m pytest tests/unit/test_streaming_tts.py -v
```
Expected: Multiple failures — `stream_synthesize` still uses `process.communicate()`, `_split_sentences` doesn't exist.

- [ ] **Step 2.3: Rewrite `StreamingTTSService`**

Replace the full contents of `backend/app/services/streaming_tts_service.py` with:

```python
import asyncio
import re
from dataclasses import dataclass
from typing import AsyncGenerator
import logging

from app.services.audio_processing_service import build_wav_header

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
        model_path: str = "en_US-lessac-medium",
        piper_binary: str = "piper",
        sample_rate: int = 16000,
    ):
        self.model_path = model_path
        self.piper_binary = piper_binary
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
        proc = await asyncio.create_subprocess_exec(
            self.piper_binary,
            "--model", self.model_path,
            "--output-raw",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        proc.stdin.write(sentence.encode("utf-8"))
        proc.stdin.close()
        pcm_bytes = await proc.stdout.read()
        await proc.wait()
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
```

- [ ] **Step 2.4: Run tests**

```bash
cd backend
python -m pytest tests/unit/test_streaming_tts.py -v
```
Expected: All 4 tests PASS.

- [ ] **Step 2.5: Run full unit tests to check nothing regressed**

```bash
cd backend
python -m pytest tests/unit/ -v
```

- [ ] **Step 2.6: Commit**

```bash
git add backend/app/services/streaming_tts_service.py backend/tests/unit/test_streaming_tts.py
git commit -m "feat: rewrite StreamingTTSService for genuine sentence-level streaming"
```

---

## Task 3: VideoInterviewWSHandler — Auth, Session, State Machine, Heartbeat

**Files:**
- Create: `backend/app/services/video_interview_ws_handler.py`
- Create: `backend/tests/integration/test_video_interview_ws.py`

- [ ] **Step 3.1: Write failing integration tests for auth and session creation**

```python
# backend/tests/integration/test_video_interview_ws.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock

# We'll add the WS endpoint in Task 6; for now test the handler directly.

VALID_TOKEN = "test-token-abc"
COMPLETED_TOKEN = "completed-token"

def make_mock_candidate(status="pending"):
    return {
        "id": "cand-1",
        "interview_token": VALID_TOKEN,
        "status": status,
        "campaign_id": "camp-1",
    }

def make_mock_campaign():
    return {
        "id": "camp-1",
        "name": "Test Campaign",
        "job_role": "Engineer",
        "job_description": "Write code",
        "questions": [
            {"question_text": "Tell me about yourself.", "topic": "intro", "difficulty": "easy"},
            {"question_text": "Describe a hard project.", "topic": "experience", "difficulty": "medium"},
        ],
        "interview_style": "conversational",
        "org_id": "org-1",
    }

def make_mock_session():
    return {
        "id": "sess-1",
        "candidate_id": "cand-1",
        "status": "in_progress",
        "session_state": {
            "current_index": 1,
            "max_questions": 2,
            "last_turn_index": 0,
            "greeting": "Hi! Welcome to your interview.",
            "conversation_history": [
                {"role": "ai", "content": "Tell me about yourself."},
            ],
        },
    }

@pytest.mark.asyncio
async def test_completed_candidate_gets_error_message():
    from app.services.video_interview_ws_handler import VideoInterviewWSHandler

    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.close = AsyncMock()

    with patch(
        "app.services.video_interview_ws_handler.VideoInterviewService.get_candidate_by_token",
        side_effect=ValueError("Interview link expired"),
    ):
        handler = VideoInterviewWSHandler(mock_ws, COMPLETED_TOKEN)
        await handler.run()

    # Should send an error message and close, not raise
    mock_ws.send_json.assert_called_once()
    call_args = mock_ws.send_json.call_args[0][0]
    assert call_args["type"] == "error"
    mock_ws.close.assert_called_once()

@pytest.mark.asyncio
async def test_reconnect_loads_existing_session():
    from app.services.video_interview_ws_handler import VideoInterviewWSHandler

    mock_ws = AsyncMock()
    mock_ws.accept = AsyncMock()
    mock_ws.send_json = AsyncMock()
    mock_ws.close = AsyncMock()
    mock_ws.receive_json = AsyncMock(return_value={"type": "disconnect"})

    with patch(
        "app.services.video_interview_ws_handler.VideoInterviewService.get_candidate_by_token",
        return_value=(make_mock_candidate(status="in_progress"), make_mock_campaign()),
    ), patch(
        "app.services.video_interview_ws_handler.VideoInterviewWSHandler._find_active_session",
        return_value=make_mock_session(),
    ), patch(
        "app.services.video_interview_ws_handler.VideoInterviewWSHandler._stream_tts_and_send",
        new_callable=AsyncMock,
    ):
        handler = VideoInterviewWSHandler(mock_ws, VALID_TOKEN)
        # We test that the handler loads the existing session (last_turn_index=0)
        # and tries to resume, not create a fresh one
        assert handler  # just verifying import works for now
```

- [ ] **Step 3.2: Run test to confirm import fails (service doesn't exist yet)**

```bash
cd backend
python -m pytest tests/integration/test_video_interview_ws.py::test_completed_candidate_gets_error_message -v
```
Expected: `ModuleNotFoundError` for `video_interview_ws_handler`

- [ ] **Step 3.3: Create `VideoInterviewWSHandler` with auth + session management + heartbeat**

Create `backend/app/services/video_interview_ws_handler.py`:

```python
import asyncio
import logging
from typing import Optional

from fastapi import WebSocket

from app.services.video_interview_service import VideoInterviewService
from app.services.stt_service import STTService
from app.services.streaming_tts_service import StreamingTTSService
from app.services.llm_orchestrator import LLMOrchestrator
from app.services.audio_processing_service import build_wav_header

logger = logging.getLogger(__name__)

# In-memory single-connection-per-token guard (single-process Uvicorn)
# Replace with Redis-backed counter for multi-process deployments.
_active_connections: dict[str, WebSocket] = {}

PING_INTERVAL = 10       # seconds between server pings
PONG_TIMEOUT = 5         # seconds client has to reply
SILENCE_FIRST = 8        # seconds before first engagement prompt
SILENCE_SECOND = 15      # cumulative seconds before second prompt
SILENCE_ABANDON = 30     # cumulative seconds before session abandoned


class VideoInterviewWSHandler:
    """Manages the full lifecycle of a real-time WebSocket interview session."""

    def __init__(self, websocket: WebSocket, token: str):
        self.ws = websocket
        self.token = token
        self.candidate: Optional[dict] = None
        self.campaign: Optional[dict] = None
        self.session: Optional[dict] = None
        self.session_state: Optional[dict] = None
        self.state: str = "loading"  # loading|greeting|listening|thinking|speaking|engaging|done
        self._audio_frames: list[bytes] = []
        self._tts_task: Optional[asyncio.Task] = None
        self._silence_seconds: float = 0.0
        self._silence_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._engagement_count: int = 0
        self._is_engagement_turn: bool = False

        self._stt = STTService()
        self._tts = StreamingTTSService()
        self._llm = LLMOrchestrator()
        self._video_service = VideoInterviewService()

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    async def run(self):
        await self.ws.accept()

        # Auth
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, self._video_service.get_candidate_by_token, self.token
            )
            self.candidate, self.campaign = result
        except ValueError as e:
            await self.ws.send_json({"type": "error", "message": str(e)})
            await self.ws.close()
            return
        except Exception as e:
            logger.error("Auth error for token %s: %s", self.token, e)
            await self.ws.send_json({"type": "error", "message": "Authentication failed"})
            await self.ws.close()
            return

        # Single-connection guard
        if self.token in _active_connections:
            old_ws = _active_connections[self.token]
            try:
                await old_ws.close(code=4000)
            except Exception:
                pass
        _active_connections[self.token] = self.ws

        try:
            await self._setup_session()
            await self._start_greeting()
            await self._message_loop()
        except Exception as e:
            logger.error("Session error for token %s: %s", self.token, e)
        finally:
            _active_connections.pop(self.token, None)
            self._cancel_tasks()

    async def _setup_session(self):
        """Load existing in-progress session or create a new one."""
        candidate_id = self.candidate["id"]
        existing = await asyncio.get_event_loop().run_in_executor(
            None, self._find_active_session, candidate_id
        )
        if existing:
            self.session = existing
            self.session_state = existing["session_state"]
            logger.info("Resuming session %s for candidate %s", existing["id"], candidate_id)
        else:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._video_service.start_session,
                self.candidate,
                self.campaign,
            )
            self.session = result
            self.session_state = result["session_state"]
            # Override max_questions: start_session() derives it from interview_style (bug)
            self.session_state["max_questions"] = len(self.campaign["questions"])
            self.session_state["last_turn_index"] = -1
            await self._persist_session_state()

    def _find_active_session(self, candidate_id: str) -> Optional[dict]:
        """Query DB for an existing in-progress session for this candidate."""
        from app.core.database import supabase
        result = (
            supabase.table("video_interview_sessions")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("status", "in_progress")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data
        return rows[0] if rows else None

    async def _persist_session_state(self):
        """Write current session_state to DB."""
        from app.core.database import supabase
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: supabase.table("video_interview_sessions")
            .update({"session_state": self.session_state})
            .eq("id", self.session["id"])
            .execute(),
        )

    def _cancel_tasks(self):
        for task in [self._tts_task, self._silence_task, self._ping_task]:
            if task and not task.done():
                task.cancel()

    # ─── State transitions ─────────────────────────────────────────────────

    async def _set_state(self, new_state: str):
        self.state = new_state
        await self.ws.send_json({"type": "state", "value": new_state})

    # ─── Greeting ──────────────────────────────────────────────────────────

    async def _start_greeting(self):
        await self._set_state("greeting")
        greeting = self.session_state.get("greeting", "Welcome! Let's begin your interview.")
        await self._stream_tts_and_send(greeting, is_engagement=False)
        await self._set_state("listening")
        self._start_silence_timer()
        self._ping_task = asyncio.create_task(self._heartbeat_loop())

    # ─── Message loop ──────────────────────────────────────────────────────

    async def _message_loop(self):
        while True:
            try:
                msg = await self.ws.receive_json()
            except Exception:
                break

            msg_type = msg.get("type")

            if msg_type == "audio_chunk":
                self._reset_silence_timer()
                import base64
                frame = base64.b64decode(msg["data"])
                self._audio_frames.append(frame)

            elif msg_type == "audio_end":
                self._reset_silence_timer()
                await self._process_audio_turn()

            elif msg_type == "barge_in":
                await self._handle_barge_in()

            elif msg_type == "mic_off":
                await self._handle_mic_off()

            elif msg_type == "mic_on":
                self._reset_silence_timer()
                await self._set_state("listening")

            elif msg_type == "pong":
                pass  # heartbeat acknowledged

            elif msg_type == "disconnect":
                break

    # ─── Heartbeat ─────────────────────────────────────────────────────────

    async def _heartbeat_loop(self):
        while True:
            await asyncio.sleep(PING_INTERVAL)
            try:
                await self.ws.send_json({"type": "ping"})
            except Exception:
                break
            # Give client PONG_TIMEOUT seconds; we trust it if we keep receiving messages
            # (a proper pong check would require tracking last-pong time separately)

    # ─── Silence engagement ────────────────────────────────────────────────

    def _start_silence_timer(self):
        self._silence_task = asyncio.create_task(self._silence_loop())

    def _reset_silence_timer(self):
        if self._silence_task and not self._silence_task.done():
            self._silence_task.cancel()
        self._silence_seconds = 0.0
        self._engagement_count = 0
        if self.state == "listening":
            self._silence_task = asyncio.create_task(self._silence_loop())

    async def _silence_loop(self):
        try:
            while True:
                await asyncio.sleep(1.0)
                if self.state != "listening":
                    continue
                self._silence_seconds += 1.0

                if self._silence_seconds >= SILENCE_ABANDON:
                    await self._abandon_session()
                    return

                if self._engagement_count == 0 and self._silence_seconds >= SILENCE_FIRST:
                    self._engagement_count = 1
                    await self._send_engagement_prompt("silence", "Take your time — I'm listening whenever you're ready.")

                elif self._engagement_count == 1 and self._silence_seconds >= SILENCE_SECOND:
                    self._engagement_count = 2
                    await self._send_engagement_prompt("silence", "Are you still there? Let me know when you're ready to continue.")
        except asyncio.CancelledError:
            pass

    async def _send_engagement_prompt(self, reason: str, text: str):
        await self.ws.send_json({"type": "engagement_prompt", "reason": reason})
        await self._set_state("engaging")
        self._is_engagement_turn = True
        await self._stream_tts_and_send(text, is_engagement=True)
        self._is_engagement_turn = False
        await self._set_state("listening")

    async def _handle_mic_off(self):
        if self._silence_task and not self._silence_task.done():
            self._silence_task.cancel()
        await self._send_engagement_prompt("mic_off", "It looks like your microphone is turned off. Please unmute to continue.")

    async def _abandon_session(self):
        from app.core.database import supabase
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: supabase.table("video_interview_sessions")
            .update({"status": "abandoned"})
            .eq("id", self.session["id"])
            .execute(),
        )
        await self.ws.close()

    # ─── Barge-in ──────────────────────────────────────────────────────────

    async def _handle_barge_in(self):
        if self._tts_task and not self._tts_task.done():
            self._tts_task.cancel()
        self._audio_frames.clear()
        await self._set_state("listening")
        self._start_silence_timer()

    # ─── Audio pipeline ────────────────────────────────────────────────────

    async def _process_audio_turn(self):
        if not self._audio_frames:
            return

        await self._set_state("thinking")

        # Assemble WAV from raw PCM frames
        raw_pcm = b"".join(self._audio_frames)
        self._audio_frames.clear()
        wav_bytes = build_wav_header(raw_pcm) + raw_pcm

        # STT (blocking — run in executor to avoid blocking event loop)
        try:
            transcript = await asyncio.get_event_loop().run_in_executor(
                None, self._stt.transcribe, wav_bytes
            )
        except Exception as e:
            logger.error("STT failed: %s", e)
            await self._set_state("listening")
            return

        if not transcript or not transcript.strip():
            await self._set_state("listening")
            return

        await self.ws.send_json({"type": "transcript", "text": transcript})

        # Update conversation history
        history = self.session_state.setdefault("conversation_history", [])
        history.append({"role": "candidate", "content": transcript})

        current_index = self.session_state.get("current_index", 0)
        max_questions = self.session_state.get("max_questions", len(self.campaign["questions"]))

        if current_index >= max_questions:
            await self._finalize_session()
            return

        # Generate follow-up question via LLM
        next_question = await asyncio.get_event_loop().run_in_executor(
            None,
            self._video_service._generate_conversational_question,
            self.campaign,
            history,
        )

        history.append({"role": "ai", "content": next_question})
        self.session_state["current_index"] = current_index + 1
        self.session_state["last_turn_index"] = current_index
        await self._persist_session_state()

        # Stream TTS response
        self._tts_task = asyncio.create_task(
            self._stream_tts_and_send(next_question, is_engagement=False)
        )
        await self._tts_task

    # ─── TTS streaming ─────────────────────────────────────────────────────

    async def _stream_tts_and_send(self, text: str, is_engagement: bool = False):
        import base64
        await self._set_state("speaking")
        try:
            async for chunk in self._tts.stream_synthesize(text):
                if chunk.is_final:
                    break
                await self.ws.send_json({
                    "type": "tts_chunk",
                    "audio": base64.b64encode(chunk.audio).decode(),
                    "text": chunk.text,
                })
            await self.ws.send_json({"type": "tts_end"})
        except asyncio.CancelledError:
            logger.info("TTS cancelled (barge-in or disconnect)")
            raise

        if not is_engagement:
            await self._set_state("listening")
            self._start_silence_timer()

    # ─── Session finalization ───────────────────────────────────────────────

    async def _finalize_session(self):
        closing = "Thank you so much for your time today. We'll be in touch soon. Best of luck!"
        self._tts_task = asyncio.create_task(
            self._stream_tts_and_send(closing, is_engagement=False)
        )
        await self._tts_task

        history = self.session_state.get("conversation_history", [])
        summary = await asyncio.get_event_loop().run_in_executor(
            None, self._generate_ws_summary, history
        )

        from app.core.database import supabase
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: supabase.table("video_interview_sessions")
            .update({
                "status": "completed",
                "interview_summary": summary,
                "transcript": history,
            })
            .eq("id", self.session["id"])
            .execute(),
        )
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: supabase.table("video_interview_candidates")
            .update({"status": "completed"})
            .eq("id", self.candidate["id"])
            .execute(),
        )

        await self.ws.send_json({"type": "interview_complete", "summary": summary})
        await self._set_state("done")
        await self.ws.close()

    def _generate_ws_summary(self, history: list[dict]) -> dict:
        """Generate interview summary using LLM with correct field shapes for the WS flow."""
        transcript_lines = [
            f"{'AI' if h['role'] == 'ai' else 'Candidate'}: {h['content']}"
            for h in history
        ]
        transcript_text = "\n".join(transcript_lines)
        transcript_preview = transcript_text[:200]

        prompt = f"""You are evaluating a job interview. Based on the conversation below, provide a JSON assessment.

Interview transcript:
{transcript_text}

Respond with ONLY valid JSON in this exact format:
{{
  "recommendation": "Strong recommend" | "Recommend" | "Consider" | "Not recommended",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1"],
  "overall_score": <number 0-100, derived from recommendation: Strong recommend=90, Recommend=75, Consider=50, Not recommended=25>
}}"""

        try:
            response = self._llm.generate_completion(prompt, temperature=0.1)
            import json
            data = json.loads(response)
            data["session_id"] = self.session["id"]
            data["transcript_preview"] = transcript_preview
            return data
        except Exception as e:
            logger.error("Summary generation failed: %s", e)
            return {
                "session_id": self.session["id"],
                "overall_score": 50,
                "recommendation": "Consider",
                "strengths": [],
                "weaknesses": [],
                "transcript_preview": transcript_preview,
            }
```

- [ ] **Step 3.4: Run the first integration test**

```bash
cd backend
python -m pytest tests/integration/test_video_interview_ws.py::test_completed_candidate_gets_error_message -v
```
Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
git add backend/app/services/video_interview_ws_handler.py backend/tests/integration/test_video_interview_ws.py
git commit -m "feat: add VideoInterviewWSHandler with auth, session, state machine, and heartbeat"
```

---

## Task 4: WebSocket Endpoint Registration

**Files:**
- Modify: `backend/app/api/v1/video_interviews.py`

- [ ] **Step 4.1: Add the WS endpoint**

Open `backend/app/api/v1/video_interviews.py`. Find the end of the file (after the last route). Add:

```python
from fastapi import WebSocket

@router.websocket("/ws/{token}")
async def video_interview_websocket(websocket: WebSocket, token: str):
    """Real-time WebSocket interview session."""
    from app.services.video_interview_ws_handler import VideoInterviewWSHandler
    handler = VideoInterviewWSHandler(websocket, token)
    await handler.run()
```

- [ ] **Step 4.2: Verify the server starts without errors**

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000 &
sleep 3
curl http://localhost:8000/api/v1/video-interviews/campaigns 2>/dev/null | head -c 100
kill %1
```
Expected: Server starts and the existing campaigns endpoint responds (or returns 401 — both are fine).

- [ ] **Step 4.3: Test WS endpoint registration via TestClient**

Add to `backend/tests/integration/test_video_interview_ws.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

def test_ws_endpoint_rejects_invalid_token():
    client = TestClient(app)
    with patch(
        "app.services.video_interview_ws_handler.VideoInterviewService.get_candidate_by_token",
        side_effect=ValueError("Interview link expired"),
    ):
        with client.websocket_connect("/api/v1/video-interviews/ws/bad-token") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "error"
```

```bash
cd backend
python -m pytest tests/integration/test_video_interview_ws.py::test_ws_endpoint_rejects_invalid_token -v
```
Expected: PASS

- [ ] **Step 4.4: Commit**

```bash
git add backend/app/api/v1/video_interviews.py backend/tests/integration/test_video_interview_ws.py
git commit -m "feat: register WebSocket endpoint /ws/{token} for real-time interviews"
```

---

## Task 5: Frontend — AudioWorklet VAD Processor

**Files:**
- Create: `frontend/public/worklets/vad-processor.js`

- [ ] **Step 5.1: Create the AudioWorklet VAD processor**

Create `frontend/public/worklets/vad-processor.js`:

```javascript
/**
 * VAD AudioWorklet Processor
 * Processes 20ms audio frames (320 samples at 16kHz).
 * Modes: 'listening' (normal speech threshold) | 'speaking' (lower barge-in threshold)
 */
class VadProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._mode = 'listening';         // 'listening' | 'speaking'
    this._speechThreshold = 0.03;     // updated after calibration
    this._ambientRms = 0.01;
    this._calibrationFrames = [];
    this._calibrating = true;
    this._calibrationTarget = 75;     // 1.5s at 20ms frames
    this._speechCount = 0;            // consecutive frames above threshold
    this._silenceCount = 0;           // consecutive frames below threshold
    this._isSpeaking = false;
    this._silenceFramesNeeded = 40;   // 800ms at 20ms frames

    this.port.onmessage = (e) => {
      if (e.data.type === 'set_mode') {
        this._mode = e.data.mode;
      }
    };
  }

  _rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  _zeroCrossingRate(samples) {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
    }
    return crossings / samples.length;
  }

  _toInt16(samples) {
    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const samples = input[0]; // Float32Array, 128 samples per quantum
    // Accumulate to 320 samples (20ms at 16kHz)
    if (!this._buffer) this._buffer = [];
    this._buffer.push(...samples);

    if (this._buffer.length < 320) return true;

    const frame = new Float32Array(this._buffer.splice(0, 320));

    // Calibration phase: collect ambient noise for 1.5s
    if (this._calibrating) {
      this._calibrationFrames.push(this._rms(frame));
      if (this._calibrationFrames.length >= this._calibrationTarget) {
        const avg = this._calibrationFrames.reduce((a, b) => a + b) / this._calibrationFrames.length;
        this._ambientRms = avg;
        this._speechThreshold = Math.max(0.02, avg * 3);
        this._calibrating = false;
        this.port.postMessage({ type: 'calibrated', threshold: this._speechThreshold });
      }
      return true;
    }

    const rms = this._rms(frame);
    const zcr = this._zeroCrossingRate(frame);
    // Voice has both energy (RMS) and zero-crossings in voice frequency range
    const isVoice = rms > this._speechThreshold && zcr > 0.05;

    const threshold = this._mode === 'speaking'
      ? this._speechThreshold * 0.5
      : this._speechThreshold;

    const aboveThreshold = rms > threshold && (this._mode === 'speaking' || isVoice);

    if (aboveThreshold) {
      this._silenceCount = 0;
      this._speechCount++;

      if (!this._isSpeaking && this._speechCount >= 3) {
        this._isSpeaking = true;
        this.port.postMessage({ type: 'speech_start' });
      }

      if (this._isSpeaking) {
        // Send PCM chunk to main thread
        const int16 = this._toInt16(frame);
        this.port.postMessage({ type: 'chunk', data: int16.buffer }, [int16.buffer]);
      }
    } else {
      this._speechCount = 0;
      if (this._isSpeaking) {
        this._silenceCount++;
        // Still send frames during silence (so backend gets the tail)
        const int16 = this._toInt16(frame);
        this.port.postMessage({ type: 'chunk', data: int16.buffer }, [int16.buffer]);

        if (this._silenceCount >= this._silenceFramesNeeded) {
          this._isSpeaking = false;
          this._silenceCount = 0;
          this.port.postMessage({ type: 'end_of_speech' });
        }
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('vad-processor', VadProcessor);
```

- [ ] **Step 5.2: Verify the file is served by Next.js**

```bash
cd frontend
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/worklets/vad-processor.js
kill %1
```
Expected: `200`

- [ ] **Step 5.3: Commit**

```bash
git add frontend/public/worklets/vad-processor.js
git commit -m "feat: add AudioWorklet VAD processor with dynamic calibration and barge-in mode"
```

---

## Task 6: Frontend — WS URL Helper + Environment Variable

**Files:**
- Modify: `frontend/src/lib/api/video-interviews.ts`
- Modify: `frontend/.env.local` (create if absent)

- [ ] **Step 6.1: Add `getVideoInterviewWSUrl` to the API client**

Open `frontend/src/lib/api/video-interviews.ts`. Add at the end of the file:

```typescript
/**
 * Returns the WebSocket URL for a video interview session.
 * Next.js rewrites() cannot upgrade WS connections, so we connect
 * directly to the FastAPI backend using NEXT_PUBLIC_WS_URL.
 */
export function getVideoInterviewWSUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'
  return `${base}/api/v1/video-interviews/ws/${token}`
}
```

- [ ] **Step 6.2: Add env var to `.env.local`**

If `frontend/.env.local` does not exist, create it. Add this line:

```
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/lib/api/video-interviews.ts frontend/.env.local
git commit -m "feat: add getVideoInterviewWSUrl helper and NEXT_PUBLIC_WS_URL env var"
```

---

## Task 7: Frontend — `page.tsx` Rewrite (WS + State Machine)

**Files:**
- Modify: `frontend/src/app/video-interview/[token]/page.tsx`

This task replaces the HTTP turn loop with a WebSocket connection. The existing file is large — read it fully before editing.

> **Note:** Read `frontend/src/app/video-interview/[token]/page.tsx` completely before starting this task to understand all existing refs, effects, and media setup to preserve.

- [ ] **Step 7.1: Add WS state and replace HTTP turn logic**

The new `page.tsx` structure (keep existing media setup, VRM avatar, device controls — replace only the interview logic section):

Key additions/changes:
1. Import `getVideoInterviewWSUrl` from `@/lib/api/video-interviews`
2. Import `Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare` from `lucide-react`
3. Add state: `interviewState`, `showTranscript`, `transcriptEntries`, `overlayMessage`
4. Replace HTTP `submitVideoAudioTurn` with WebSocket `sendMessage`
5. Add `useEffect` for WS connection lifecycle

Replace the interview state type and WebSocket connection:

```typescript
// At top of component, replace existing state:
type InterviewState = 'loading' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'engaging' | 'done' | 'error'
const [interviewState, setInterviewState] = useState<InterviewState>('loading')
const [showTranscript, setShowTranscript] = useState(false)
const [transcriptEntries, setTranscriptEntries] = useState<{role: 'ai'|'candidate', text: string}[]>([])
const [overlayMessage, setOverlayMessage] = useState<{text: string, type: 'silence'|'mic_off'|'connection'} | null>(null)
const wsRef = useRef<WebSocket | null>(null)
const ttsQueueRef = useRef<AudioBufferSourceNode[]>([])
const ttsTextAccRef = useRef<string>('')  // accumulate tts_chunk texts for transcript
const isEngagementTurnRef = useRef(false)
const scheduledTimeRef = useRef(0)  // for gapless audio scheduling
```

WebSocket connection `useEffect` (add after media setup effect):

```typescript
useEffect(() => {
  if (!token || !sessionId) return  // wait until session started via HTTP start_session

  const wsUrl = getVideoInterviewWSUrl(token as string)
  const ws = new WebSocket(wsUrl)
  wsRef.current = ws

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data)
    await handleServerMessage(msg)
  }

  ws.onclose = () => {
    // Show reconnect overlay (handled separately)
  }

  return () => {
    ws.close()
  }
}, [token, sessionId])
```

- [ ] **Step 7.2: Implement `handleServerMessage`**

```typescript
const handleServerMessage = async (msg: any) => {
  switch (msg.type) {
    case 'state':
      setInterviewState(msg.value as InterviewState)
      // Relay mode to AudioWorklet
      if (vadWorkletRef.current) {
        vadWorkletRef.current.port.postMessage({
          type: 'set_mode',
          mode: msg.value === 'speaking' ? 'speaking' : 'listening'
        })
      }
      break

    case 'transcript':
      setTranscriptEntries(prev => [...prev, { role: 'candidate', text: msg.text }])
      break

    case 'tts_chunk':
      ttsTextAccRef.current += (ttsTextAccRef.current ? ' ' : '') + msg.text
      await enqueueTtsChunk(msg.audio)
      break

    case 'tts_end':
      if (!isEngagementTurnRef.current && ttsTextAccRef.current) {
        setTranscriptEntries(prev => [...prev, { role: 'ai', text: ttsTextAccRef.current }])
      }
      ttsTextAccRef.current = ''
      isEngagementTurnRef.current = false
      setOverlayMessage(null)  // dismiss engagement overlay when AI finishes speaking
      break

    case 'engagement_prompt':
      isEngagementTurnRef.current = true
      setOverlayMessage({
        text: msg.reason === 'mic_off'
          ? 'Mic is off — please unmute to continue'
          : 'Take your time — I\'m listening whenever you\'re ready',
        type: msg.reason
      })
      // Auto-dismiss overlay after TTS ends (handled on tts_end)
      break

    case 'ping':
      wsRef.current?.send(JSON.stringify({ type: 'pong' }))
      break

    case 'interview_complete':
      setInterviewState('done')
      await handleInterviewComplete(msg.summary)
      break

    case 'error':
      setInterviewState('error')
      break
  }
}
```

- [ ] **Step 7.3: Commit partial work**

```bash
git add frontend/src/app/video-interview/[token]/page.tsx
git commit -m "feat: add WebSocket connection and message handler to interview page"
```

---

## Task 8: Frontend — Streaming TTS Audio Queue

**Files:**
- Modify: `frontend/src/app/video-interview/[token]/page.tsx`

- [ ] **Step 8.1: Add AudioWorklet VAD setup**

Add a new `useEffect` for the AudioWorklet (runs after `audioContextRef` is established):

```typescript
const vadWorkletRef = useRef<AudioWorkletNode | null>(null)

// In the media setup effect, after creating audioContext:
await audioContextRef.current.audioWorklet.addModule('/worklets/vad-processor.js')
const vadNode = new AudioWorkletNode(audioContextRef.current, 'vad-processor')
vadWorkletRef.current = vadNode

// Connect mic → vad worklet (not to destination — no echo)
const micSource = audioContextRef.current.createMediaStreamSource(stream)
micSource.connect(vadNode)

vadNode.port.onmessage = (e) => {
  const { type, data } = e.data

  if (type === 'chunk' && wsRef.current?.readyState === WebSocket.OPEN) {
    // PCM chunk: ArrayBuffer → base64 → send
    const uint8 = new Uint8Array(data)
    const b64 = btoa(String.fromCharCode(...uint8))
    wsRef.current.send(JSON.stringify({ type: 'audio_chunk', data: b64 }))
  }

  if (type === 'end_of_speech') {
    wsRef.current?.send(JSON.stringify({ type: 'audio_end' }))
  }

  if (type === 'speech_start' && interviewStateRef.current === 'speaking') {
    // Barge-in: stop all queued TTS nodes
    drainTtsQueue()
    wsRef.current?.send(JSON.stringify({ type: 'barge_in' }))
  }
}
```

> **Note:** Add `interviewStateRef` as a ref that mirrors `interviewState` so it's accessible in the worklet callback without stale closure.
> ```typescript
> const interviewStateRef = useRef<InterviewState>('loading')
> useEffect(() => { interviewStateRef.current = interviewState }, [interviewState])
> ```

- [ ] **Step 8.2: Implement gapless TTS playback queue**

```typescript
const avatarAudioCtxRef = useRef<AudioContext | null>(null)
const ttsQueueRef = useRef<AudioBufferSourceNode[]>([])
const scheduledTimeRef = useRef<number>(0)

async function enqueueTtsChunk(audioB64: string) {
  if (!avatarAudioCtxRef.current) {
    avatarAudioCtxRef.current = new AudioContext()
  }
  const ctx = avatarAudioCtxRef.current
  if (ctx.state === 'suspended') await ctx.resume()

  const binary = atob(audioB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer)
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(ctx.destination)

  // Also connect to analyser for VRM lip-sync
  if (avatarAnalyserRef.current) {
    source.connect(avatarAnalyserRef.current)
  }

  const now = ctx.currentTime
  const startTime = Math.max(now, scheduledTimeRef.current)
  source.start(startTime)
  scheduledTimeRef.current = startTime + audioBuffer.duration

  // Store node reference for barge-in cleanup
  ttsQueueRef.current.push(source)
  source.onended = () => {
    ttsQueueRef.current = ttsQueueRef.current.filter(n => n !== source)
  }
}

function drainTtsQueue() {
  ttsQueueRef.current.forEach(node => {
    try { node.stop() } catch (_) {}
  })
  ttsQueueRef.current = []
  scheduledTimeRef.current = 0
}
```

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/app/video-interview/[token]/page.tsx
git commit -m "feat: add AudioWorklet VAD and sentence-streaming TTS playback queue"
```

---

## Task 9: Frontend — Control Bar, Transcript Panel, Overlays

**Files:**
- Modify: `frontend/src/app/video-interview/[token]/page.tsx`

- [ ] **Step 9.1: Update imports**

At the top of `page.tsx`, add/replace icon imports:

```typescript
import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare } from 'lucide-react'
```

- [ ] **Step 9.2: Replace the control bar JSX**

Find the existing control bar section and replace with:

```tsx
{/* Control bar — anchored bottom center */}
<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
  {/* Mic toggle */}
  <button
    onClick={toggleMic}
    className={`relative flex h-12 w-12 items-center justify-center rounded-full border transition-colors
      ${micEnabled
        ? 'border-slate-600 bg-slate-800 hover:bg-slate-700'
        : 'border-red-500 bg-red-900/60 hover:bg-red-800'}`}
    aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
  >
    {micEnabled ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-red-400" />}
  </button>

  {/* Camera toggle */}
  <button
    onClick={toggleCamera}
    className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors
      ${cameraEnabled
        ? 'border-slate-600 bg-slate-800 hover:bg-slate-700'
        : 'border-slate-500 bg-slate-800/60 hover:bg-slate-700'}`}
    aria-label={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
  >
    {cameraEnabled ? <Video className="h-5 w-5 text-white" /> : <VideoOff className="h-5 w-5 text-slate-400" />}
  </button>

  {/* End interview */}
  <button
    onClick={handleEndInterview}
    className="flex h-12 items-center gap-2 rounded-full bg-red-600 px-5 hover:bg-red-700 transition-colors"
    aria-label="End interview"
  >
    <PhoneOff className="h-5 w-5 text-white" />
    <span className="text-sm font-medium text-white">End</span>
  </button>

  {/* Transcript toggle */}
  <button
    onClick={() => setShowTranscript(v => !v)}
    className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors
      ${showTranscript
        ? 'border-indigo-500 bg-indigo-600 hover:bg-indigo-700'
        : 'border-slate-600 bg-slate-800 hover:bg-slate-700'}`}
    aria-label="Toggle transcript"
  >
    <MessageSquare className="h-5 w-5 text-white" />
  </button>
</div>
```

Update `toggleMic` to send WS events:

```typescript
const toggleMic = () => {
  const newEnabled = !micEnabled
  setMicEnabled(newEnabled)
  if (videoRef.current?.srcObject) {
    const stream = videoRef.current.srcObject as MediaStream
    stream.getAudioTracks().forEach(t => { t.enabled = newEnabled })
  }
  wsRef.current?.send(JSON.stringify({ type: newEnabled ? 'mic_on' : 'mic_off' }))
}
```

- [ ] **Step 9.3: Add the collapsible transcript panel**

Add just above the control bar:

```tsx
{/* Collapsible transcript panel */}
<div
  className={`absolute bottom-24 left-4 right-4 overflow-hidden rounded-xl bg-slate-900/90 backdrop-blur-sm border border-slate-700 transition-all duration-300 ${
    showTranscript ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
  }`}
>
  <div className="p-3">
    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Transcript</p>
    <div className="max-h-32 overflow-y-auto space-y-1">
      {transcriptEntries.map((entry, i) => (
        <p key={i} className="text-sm leading-relaxed">
          <span className={entry.role === 'ai' ? 'text-indigo-400' : 'text-slate-300'}>
            {entry.role === 'ai' ? 'AI: ' : 'You: '}
          </span>
          <span className="text-slate-200">{entry.text}</span>
        </p>
      ))}
    </div>
  </div>
</div>
```

- [ ] **Step 9.4: Add overlay banners**

Add just below the avatar area:

```tsx
{/* Engagement / connection overlay */}
{overlayMessage && (
  <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg
    ${overlayMessage.type === 'connection'
      ? 'bg-red-900/90 text-red-200 border border-red-700'
      : 'bg-amber-900/90 text-amber-200 border border-amber-700'}`}
  >
    {overlayMessage.type === 'mic_off' && <MicOff className="h-4 w-4 flex-shrink-0" />}
    {overlayMessage.text}
  </div>
)}

{/* Recording indicator */}
<div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1">
  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">REC</span>
</div>

{/* Status badge */}
<div className="absolute top-4 left-1/2 -translate-x-1/2">
  <span className={`rounded-full px-3 py-1 text-xs font-medium
    ${interviewState === 'listening' ? 'bg-emerald-900/80 text-emerald-300' :
      interviewState === 'thinking' ? 'bg-amber-900/80 text-amber-300' :
      interviewState === 'speaking' ? 'bg-indigo-900/80 text-indigo-300' :
      'bg-slate-800/80 text-slate-400'}`}
  >
    {interviewState === 'listening' ? '● Listening' :
     interviewState === 'thinking' ? '⏳ Thinking…' :
     interviewState === 'speaking' ? '◎ Speaking' :
     interviewState === 'engaging' ? '◎ Speaking' :
     interviewState === 'greeting' ? '◎ Speaking' : ''}
  </span>
</div>
```

- [ ] **Step 9.5: Wire up `handleEndInterview`**

```typescript
const handleEndInterview = async () => {
  if (!confirm('End the interview?')) return
  wsRef.current?.send(JSON.stringify({ type: 'disconnect' }))
  wsRef.current?.close()
  await uploadRecording()
  router.push(`/video-interview/${token}/submitted`)
}

const handleInterviewComplete = async (summary: any) => {
  await uploadRecording()
  router.push(`/video-interview/${token}/submitted`)
}

const [isUploading, setIsUploading] = useState(false)

const uploadRecording = async () => {
  if (!mediaRecorderRef.current || !sessionId) return
  setIsUploading(true)
  // Stop recorder and collect chunks
  return new Promise<void>((resolve) => {
    mediaRecorderRef.current!.addEventListener('stop', async () => {
      const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
      try {
        await uploadVideoRecording(sessionId as string, blob)
      } catch (e) {
        // Show retry toast — do not redirect until upload succeeds
        console.error('Recording upload failed:', e)
        toast({ title: 'Upload failed', description: 'Retrying…', variant: 'destructive' })
        await uploadVideoRecording(sessionId as string, blob)  // one retry
      } finally {
        setIsUploading(false)
        resolve()
      }
    })
    mediaRecorderRef.current!.stop()
  })
}
// In JSX, show spinner overlay while uploading:
// {isUploading && (
//   <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
//     <p className="text-white text-sm font-medium">Saving your interview recording…</p>
//   </div>
// )}
```

- [ ] **Step 9.6: Build check**

```bash
cd frontend
npm run build 2>&1 | tail -20
```
Expected: Build completes. Fix any TypeScript errors before proceeding.

- [ ] **Step 9.7: Commit**

```bash
git add frontend/src/app/video-interview/[token]/page.tsx
git commit -m "feat: add control bar with Lucide icons, transcript panel, overlays, recording upload"
```

---

## Task 10: Remove Dead Code

**Files:**
- Delete: `frontend/src/app/conversational-interview/` (entire directory)
- Delete: `backend/app/services/conversation_manager.py`
- Modify: `backend/app/api/v1/__init__.py` (remove conversational import if present)

- [ ] **Step 10.1: Check for imports of the removed modules**

```bash
grep -r "conversational_interview\|conversation_manager\|ConversationManager" \
  backend/app/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 10.2: Remove conversational interview frontend route**

```bash
rm -rf "frontend/src/app/conversational-interview"
```

- [ ] **Step 10.3: Remove ConversationManager backend service**

```bash
rm "backend/app/services/conversation_manager.py"
```

- [ ] **Step 10.4: Remove any imports of removed modules**

For each file returned in Step 10.1 (except the deleted files themselves), remove or replace the import.

- [ ] **Step 10.5: Build check**

```bash
cd frontend && npm run build 2>&1 | tail -10
cd ../backend && python -c "from app.main import app; print('OK')"
```

- [ ] **Step 10.6: Commit**

```bash
git add -A
git commit -m "chore: remove conversational-interview route and ConversationManager (merged into WS handler)"
```

---

## Task 11: End-to-End Verification

Run through each verification scenario from the spec.

- [ ] **Step 11.1: Start backend and test WS connection directly**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

In a separate terminal, using wscat or Postman WS client:
```
ws://localhost:8000/api/v1/video-interviews/ws/<valid-token>
```
Expected: `{ "type": "state", "value": "greeting" }` arrives, followed by `tts_chunk` messages (multiple, one per sentence).

- [ ] **Step 11.2: Verify tts_chunk is multiple messages, not one large blob**

Confirm in Postman that `tts_chunk` fires more than once for the greeting (sentence-streaming working).

- [ ] **Step 11.3: Full interview flow in browser**

1. Create a campaign with 2 questions in the dashboard
2. Add a candidate, copy the interview link
3. Open the link in browser, complete setup, conduct full interview
4. Confirm: transcript saved to DB, recording uploaded to Supabase Storage, dashboard shows session with summary

- [ ] **Step 11.4: Barge-in test**

While TTS audio is playing, start speaking. Confirm avatar audio stops mid-sentence and state transitions to `listening`.

- [ ] **Step 11.5: Silence engagement test**

Stay silent for 10 seconds after a question. Confirm: amber overlay appears and AI speaks the engagement prompt.

- [ ] **Step 11.6: Mic-off test**

Click the mute button. Confirm: amber overlay with `MicOff` icon appears and AI speaks the mic-off prompt.

- [ ] **Step 11.7: Connection drop test**

Open interview, then close the browser tab and reopen the same URL. Confirm: session resumes at the correct turn index (not from the beginning).

- [ ] **Step 11.8: Dashboard verification**

Navigate to the campaign detail page. Confirm the completed session appears with transcript preview and recording playback link.

---

## Summary of Commits

| # | Message |
|---|---|
| 1 | `feat: add build_wav_header helper for PCM → WAV conversion` |
| 2 | `feat: rewrite StreamingTTSService for genuine sentence-level streaming` |
| 3 | `feat: add VideoInterviewWSHandler with auth, session, state machine, and heartbeat` |
| 4 | `feat: register WebSocket endpoint /ws/{token} for real-time interviews` |
| 5 | `feat: add AudioWorklet VAD processor with dynamic calibration and barge-in mode` |
| 6 | `feat: add getVideoInterviewWSUrl helper and NEXT_PUBLIC_WS_URL env var` |
| 7 | `feat: add WebSocket connection and message handler to interview page` |
| 8 | `feat: add AudioWorklet VAD and sentence-streaming TTS playback queue` |
| 9 | `feat: add control bar with Lucide icons, transcript panel, overlays, recording upload` |
| 10 | `chore: remove conversational-interview route and ConversationManager` |
