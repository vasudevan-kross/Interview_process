import asyncio
import base64
import json
import logging
from typing import Optional

from fastapi import WebSocket

from app.services.video_interview_service import VideoInterviewService
from app.services.stt_service import STTService
from app.services.streaming_tts_service import StreamingTTSService
from app.services.llm_orchestrator import get_llm_orchestrator
from app.services.audio_processing_service import build_wav_header
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# In-memory single-connection-per-token guard (single-process Uvicorn)
# Replace with Redis-backed counter for multi-process deployments.
_active_connections: dict[str, WebSocket] = {}

PING_INTERVAL = 10       # seconds between server pings
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
        self.state: str = "loading"
        self._audio_frames: list[bytes] = []
        self._tts_task: Optional[asyncio.Task] = None
        self._silence_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._engagement_count: int = 0
        self._is_engagement_turn: bool = False

        self._stt = STTService()
        self._tts = StreamingTTSService()
        self._llm = get_llm_orchestrator()
        self._video_service = VideoInterviewService()
        self._supabase = get_supabase()

    # ─── Lifecycle ────────────────────────────────────────────────────────────

    async def run(self):
        await self.ws.accept()

        # Auth — get_candidate_by_token is async, call directly
        try:
            result = await self._video_service.get_candidate_by_token(self.token)
            self.candidate = result["candidate"]
            self.campaign = result["campaign"]
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
            # start_session is async and takes only token
            result = await self._video_service.start_session(self.token)
            self.session = result["session"]
            self.session_state = self.session["session_state"]
            # Override max_questions bug: start_session derives it from interview_style field
            self.session_state["max_questions"] = len(self.campaign.get("questions", []))
            self.session_state["last_turn_index"] = -1
            await self._persist_session_state()

    def _find_active_session(self, candidate_id: str) -> Optional[dict]:
        """Query DB for an existing in-progress session for this candidate (sync, called via executor)."""
        result = (
            self._supabase.table("video_interview_sessions")
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
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._supabase.table("video_interview_sessions")
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
        # Tell the frontend the real session_id so it can upload recordings correctly
        await self.ws.send_json({"type": "session_started", "session_id": self.session["id"]})
        await self._set_state("greeting")
        greeting = self.session_state.get("greeting", "Welcome! Let's begin your interview.")
        await self._stream_tts_and_send(greeting, is_engagement=False)
        # Silence timer will start when frontend sends tts_playback_complete
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
                frame = base64.b64decode(msg["data"])
                self._audio_frames.append(frame)

            elif msg_type == "audio_end":
                self._reset_silence_timer()
                await self._process_audio_turn()

            elif msg_type == "barge_in":
                await self._handle_barge_in()

            elif msg_type == "mic_off":
                await self._handle_mic_off()

            elif msg_type == "tts_playback_complete":
                # Frontend finished playing all TTS audio — NOW start listening timer
                self._reset_silence_timer()

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
            silence_seconds = 0.0
            while True:
                await asyncio.sleep(1.0)
                if self.state != "listening":
                    continue
                silence_seconds += 1.0

                if silence_seconds >= SILENCE_ABANDON:
                    await self._abandon_session()
                    return

                if self._engagement_count == 0 and silence_seconds >= SILENCE_FIRST:
                    self._engagement_count = 1
                    await self._send_engagement_prompt(
                        "silence",
                        "Take your time — I'm listening whenever you're ready."
                    )

                elif self._engagement_count == 1 and silence_seconds >= SILENCE_SECOND:
                    self._engagement_count = 2
                    await self._send_engagement_prompt(
                        "silence",
                        "Are you still there? Let me know when you're ready to continue."
                    )
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
        await self._send_engagement_prompt(
            "mic_off",
            "It looks like your microphone is turned off. Please unmute to continue."
        )

    async def _abandon_session(self):
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._supabase.table("video_interview_sessions")
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

        # STT is synchronous (faster-whisper blocks) — run in executor
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
        max_questions = self.session_state.get("max_questions", len(self.campaign.get("questions", [])))

        if current_index >= max_questions:
            await self._finalize_session()
            return

        # Generate follow-up question — _generate_conversational_question is async
        next_question = await self._video_service._generate_conversational_question(
            conversation_history=history,
            campaign=self.campaign,
        )

        if not next_question:
            next_question = "Could you tell me more about that?"

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
            # Silence timer starts when frontend sends tts_playback_complete
            # (after it finishes playing the audio queue), not here.

    # ─── Session finalization ───────────────────────────────────────────────

    async def _finalize_session(self):
        closing = "Thank you so much for your time today. We'll be in touch soon. Best of luck!"
        self._tts_task = asyncio.create_task(
            self._stream_tts_and_send(closing, is_engagement=False)
        )
        await self._tts_task

        history = self.session_state.get("conversation_history", [])
        summary = await self._generate_ws_summary(history)

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._supabase.table("video_interview_sessions")
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
            lambda: self._supabase.table("video_interview_candidates")
            .update({"status": "completed"})
            .eq("id", self.candidate["id"])
            .execute(),
        )

        await self.ws.send_json({"type": "interview_complete", "summary": summary})
        await self._set_state("done")
        await self.ws.close()

    async def _generate_ws_summary(self, history: list[dict]) -> dict:
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
  "recommendation": "Strong recommend",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1"],
  "overall_score": 90
}}

recommendation must be one of: "Strong recommend", "Recommend", "Consider", "Not recommended"
overall_score: Strong recommend=90, Recommend=75, Consider=50, Not recommended=25"""

        try:
            result = await self._llm.generate_completion(
                prompt=prompt,
                system_prompt="You are a professional interviewer evaluator. Return valid JSON only.",
                temperature=0.1,
                max_tokens=300,
            )
            data = json.loads(result["response"])
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
