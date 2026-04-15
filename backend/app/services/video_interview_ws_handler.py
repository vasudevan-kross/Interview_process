import asyncio
import base64
import datetime
import json
import logging
import random
from typing import Optional

from fastapi import WebSocket

from app.services.video_interview_service import VideoInterviewService, _VIDEO_INTERVIEW_MODEL
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

# Short filler lines spoken before each follow-up question to feel more human
_FILLERS = [
    "Got it.",
    "Interesting.",
    "That makes sense.",
    "I see.",
    "Okay.",
    "Right.",
    "Good to know.",
]


class VideoInterviewWSHandler:
    """Manages the full lifecycle of a real-time WebSocket interview session."""

    def __init__(self, websocket: WebSocket, token: str):
        self.ws = websocket
        self.token = token
        self.candidate: Optional[dict] = None
        self.campaign: Optional[dict] = None
        self.session: Optional[dict] = None
        self.session_state: Optional[dict] = None
        self.resume_context: Optional[dict] = None
        self.state: str = "loading"
        self._is_resumed: bool = False   # True when joining an existing in-progress session
        self._closed: bool = False            # Set when WS is closed; gates all further sends
        self._processing: bool = False        # Guard against concurrent audio turn processing
        self._last_ai_text: str = ""          # Last thing AI said — used to detect echo
        self._audio_frames: list[bytes] = []
        self._tts_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._barge_in_requested: bool = False  # Synchronous flag — stops TTS loop immediately

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

        # Single-connection guard — close any previous connection for this token
        if self.token in _active_connections:
            old_ws, old_handler = _active_connections[self.token]
            old_handler._closed = True  # stop old handler from sending anything further
            try:
                await old_ws.close(code=4000)
            except Exception:
                pass
        _active_connections[self.token] = (self.ws, self)

        try:
            await self._setup_session()
            await self._start_greeting()
            await self._message_loop()
        except Exception as e:
            if not self._closed:
                logger.error("Session error for token %s: %s", self.token, e)
        finally:
            # Only remove from active_connections if we're still the registered handler
            entry = _active_connections.get(self.token)
            if entry and entry[1] is self:
                _active_connections.pop(self.token, None)
            self._cancel_tasks()
            # If the session was never finalized (disconnect mid-interview), save whatever we have
            await self._emergency_finalize()

    async def _setup_session(self):
        """Load existing in-progress session or create a new one."""
        candidate_id = self.candidate["id"]

        # Load resume context from candidate row (populated at registration time)
        self.resume_context = self.candidate.get("resume_parsed") or None

        existing = await asyncio.get_event_loop().run_in_executor(
            None, self._find_active_session, candidate_id
        )
        if existing:
            self.session = existing
            self.session_state = existing["session_state"] or {}
            self._is_resumed = True
            logger.info("Resuming session %s for candidate %s", existing["id"], candidate_id)
        else:
            # start_session is async and takes only token
            result = await self._video_service.start_session(self.token)
            self.session = result["session"]
            self.session_state = self.session["session_state"]

            # Derive max_questions from interview duration (3 min/question average).
            # Use campaign question count as a lower bound so all topics are covered.
            # Cap at 20 to prevent runaway sessions.
            campaign_questions = self.campaign.get("questions") or []
            duration_min = self.campaign.get("interview_duration_minutes") or 20
            max_q = max(len(campaign_questions) if campaign_questions else 5, duration_min // 3)
            self.session_state["max_questions"] = min(max_q, 20)
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
        for task in [self._tts_task, self._ping_task]:
            if task and not task.done():
                task.cancel()

    async def _safe_send(self, data: dict) -> bool:
        """Send a JSON message only if the WebSocket is still open. Returns False if skipped."""
        if self._closed:
            return False
        try:
            await self.ws.send_json(data)
            return True
        except Exception:
            self._closed = True
            return False

    # ─── State transitions ─────────────────────────────────────────────────

    async def _set_state(self, new_state: str):
        self.state = new_state
        await self._safe_send({"type": "state", "value": new_state})

    # ─── Greeting ──────────────────────────────────────────────────────────

    async def _start_greeting(self):
        # Tell the frontend the real session_id so it can upload recordings correctly
        await self._safe_send({"type": "session_started", "session_id": self.session["id"]})
        await self._set_state("greeting")

        if self._is_resumed:
            # Don't replay the full greeting — just pick up where we left off
            # by re-asking the last AI question from the conversation history.
            history = self.session_state.get("conversation_history", [])
            last_ai = next(
                (e["content"] for e in reversed(history) if e.get("role") == "ai"),
                None,
            )
            resume_text = last_ai or "Welcome back! Let's continue where we left off."
            self._tts_task = asyncio.create_task(
                self._stream_tts_and_send(resume_text, is_engagement=False)
            )
            await self._tts_task
        else:
            greeting = self.session_state.get("greeting", "Welcome! Let's begin your interview.")
            # The first question (qualification) is stored in session.questions[0]
            # but not in the greeting text — append it so the candidate hears the question.
            questions = (self.session or {}).get("questions") or []
            first_q = questions[0].get("question_text", "") if questions else ""
            full_greeting = f"{greeting} {first_q}".strip() if first_q else greeting
            # Update stored greeting to match what was actually spoken,
            # so the transcript formatter's greeting-skip logic works.
            self.session_state["greeting"] = full_greeting
            # Store in conversation history so transcript is complete
            history = self.session_state.setdefault("conversation_history", [])
            history.append({"role": "ai", "content": full_greeting})
            await self._persist_session_state()
            # Wrap in a task so barge-in can cancel it via self._tts_task
            self._tts_task = asyncio.create_task(
                self._stream_tts_and_send(full_greeting, is_engagement=False)
            )
            await self._tts_task

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
                frame = base64.b64decode(msg["data"])
                self._audio_frames.append(frame)

            elif msg_type == "audio_end":
                sample_rate = int(msg.get("sample_rate", 16000))
                await self._process_audio_turn(sample_rate=sample_rate)

            elif msg_type == "barge_in":
                await self._handle_barge_in()

            elif msg_type == "mic_off":
                pass  # no-op without silence timer

            elif msg_type == "tts_playback_complete":
                await self._set_state("listening")

            elif msg_type == "mic_on":
                await self._set_state("listening")

            elif msg_type == "pong":
                pass  # heartbeat acknowledged

            elif msg_type == "disconnect":
                break

    # ─── Heartbeat ─────────────────────────────────────────────────────────

    async def _heartbeat_loop(self):
        while not self._closed:
            await asyncio.sleep(PING_INTERVAL)
            sent = await self._safe_send({"type": "ping"})
            if not sent:
                break

    # ─── Barge-in ──────────────────────────────────────────────────────────

    async def _handle_barge_in(self):
        # Set synchronous flag first — stops the TTS streaming loop immediately
        # without waiting for CancelledError to propagate to the next await point.
        self._barge_in_requested = True
        if self._tts_task and not self._tts_task.done():
            self._tts_task.cancel()
        self._audio_frames.clear()
        await self._set_state("listening")

    # ─── Audio pipeline ────────────────────────────────────────────────────

    async def _process_audio_turn(self, sample_rate: int = 16000):
        if not self._audio_frames:
            return
        if self._processing:
            logger.debug("Already processing a turn, ignoring audio_end")
            self._audio_frames.clear()
            return

        self._processing = True
        try:
            await self.__process_audio_turn_inner(sample_rate)
        finally:
            self._processing = False

    async def __process_audio_turn_inner(self, sample_rate: int = 16000):
        await self._set_state("thinking")

        # Assemble WAV from raw PCM frames.
        # Use the sample rate reported by the client — iOS Safari ignores the
        # 16 kHz AudioContext hint and captures at 44100/48000 Hz; without this
        # Whisper receives a mismatched WAV header and returns empty transcripts.
        raw_pcm = b"".join(self._audio_frames)
        self._audio_frames.clear()
        wav_bytes = build_wav_header(raw_pcm, sample_rate=sample_rate) + raw_pcm

        # Build context prompt for STT to improve accuracy for technical terms
        initial_prompt = f"Interview for {self.campaign.get('job_role', 'role')}."
        if self.resume_context and self.resume_context.get("skills"):
            initial_prompt += f" Skills: {', '.join(self.resume_context['skills'][:10])}."

        # STT is synchronous (faster-whisper blocks) — run in executor
        try:
            transcript = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self._stt.transcribe(wav_bytes, initial_prompt=initial_prompt)
            )
        except Exception as e:
            logger.error("STT failed: %s", e)
            await self._set_state("listening")
            return

        if not transcript or not transcript.strip():
            await self._set_state("listening")
            return

        # Echo guard: if the transcript closely matches what the AI just said,
        # it's the mic picking up TTS speaker output — discard it.
        t_lower = transcript.strip().lower()
        if self._last_ai_text:
            import string
            # Check word overlap: if >80% of transcript words appear in last AI text, 
            # or >50% and it's a very short phrase (< 5 words), consider it echo.
            t_clean = transcript.translate(str.maketrans("", "", string.punctuation)).lower()
            ai_clean = self._last_ai_text.translate(str.maketrans("", "", string.punctuation)).lower()
            t_words = set(t_clean.split())
            ai_words = set(ai_clean.split())
            if t_words:
                overlap = len(t_words & ai_words) / len(t_words)
                if overlap > 0.8 or (overlap > 0.5 and len(t_words) < 5):
                    logger.info("Echo detected, discarding transcript: %s", transcript[:60])
                    await self._set_state("listening")
                    return

        # Also discard pure filler/goodbye transcriptions caused by speaker bleed
        _ECHO_PHRASES = {"thank you", "thanks", "goodbye", "bye", "you're welcome"}
        if t_lower.strip(".!, ") in _ECHO_PHRASES:
            logger.info("Filler echo discarded: %s", transcript)
            await self._set_state("listening")
            return

        await self._safe_send({"type": "transcript", "text": transcript})

        # Update conversation history
        history = self.session_state.setdefault("conversation_history", [])
        history.append({"role": "candidate", "content": transcript})

        # ── Stop intent detection ──
        # If the candidate asks to stop/end the interview, finalize gracefully.
        _STOP_PHRASES = [
            "stop the interview", "end the interview", "can we stop",
            "i want to stop", "let's stop", "please stop", "i'm done",
            "finish the interview", "end this interview", "stop this interview",
            "can we end", "i want to end", "let's end this",
        ]
        if any(phrase in t_lower for phrase in _STOP_PHRASES):
            logger.info("Stop intent detected: %s", transcript[:80])
            await self._finalize_session()
            return

        # ── Calculate Elapsed Time ──
        elapsed_time_seconds = 0
        if self.session.get("started_at"):
            try:
                start_val = self.session["started_at"]
                if isinstance(start_val, str):
                    start = datetime.datetime.fromisoformat(start_val.replace("Z", "+00:00"))
                else:
                    start = start_val
                elapsed_time_seconds = int((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds())
            except Exception:
                pass
                
        target_duration_seconds = (self.campaign.get("interview_duration_minutes") or 20) * 60

        # Import graph and build state
        from app.services.interview_graph import build_interview_graph
        graph = build_interview_graph()
        
        state = {
            "elapsed_time_seconds": elapsed_time_seconds,
            "target_duration_seconds": target_duration_seconds,
            "topics_covered": self.session_state.get("covered_topics", []),
            "current_topic": self.session_state.get("current_topic", "General"),
            "weak_answer_count": self.session_state.get("weak_answer_count", 0),
            "candidate_answer": transcript,
            "history": history,
            "campaign": self.campaign,
            "resume_context": self.resume_context,
            "last_ai_response": "",
            "is_complete": False
        }
        
        new_state = await graph.ainvoke(state)
        
        self.session_state["covered_topics"] = new_state.get("topics_covered", [])
        self.session_state["current_topic"] = new_state.get("current_topic", state["current_topic"])
        self.session_state["weak_answer_count"] = new_state.get("weak_answer_count", state["weak_answer_count"])
        
        if new_state.get("is_complete"):
            # finalize session (graceful wrap up)
            history.append({"role": "ai", "content": new_state["last_ai_response"]})
            await self._persist_session_state()
            
            # Speak the wrap up
            self._tts_task = asyncio.create_task(
                self._stream_tts_and_send(new_state["last_ai_response"], is_engagement=False)
            )
            try:
                await self._tts_task
            except asyncio.CancelledError:
                pass
            
            await self._finalize_session()
            return
            
        next_question = new_state.get("last_ai_response", "Could you elaborate?")
        history.append({"role": "ai", "content": next_question})
        
        self.session_state["current_index"] = self.session_state.get("current_index", 0) + 1
        self.session_state["last_turn_index"] = self.session_state["current_index"]
        
        await self._persist_session_state()

        # Filler + question run as a single cancellable task so barge-in
        # during the filler also cancels the upcoming question.
        filler = random.choice(_FILLERS)
        async def _speak_filler_then_question() -> None:
            await self._stream_tts_and_send(filler, is_engagement=True)
            await self._stream_tts_and_send(next_question, is_engagement=False)

        self._tts_task = asyncio.create_task(_speak_filler_then_question())
        await self._tts_task

    # ─── TTS streaming ─────────────────────────────────────────────────────

    async def _stream_tts_and_send(self, text: str, is_engagement: bool = False):
        # Reset barge-in flag at the start of each TTS call so a previous barge-in
        # doesn't bleed into the next utterance.
        self._barge_in_requested = False
        self._last_ai_text = text.lower()
        await self._set_state("speaking")
        try:
            async for chunk in self._tts.stream_synthesize(text):
                # Synchronous flag check — exits immediately without waiting for
                # CancelledError to propagate (faster than task cancellation alone).
                if self._barge_in_requested or self._closed:
                    return
                if chunk.is_final:
                    break
                sent = await self._safe_send({
                    "type": "tts_chunk",
                    "audio": base64.b64encode(chunk.audio).decode(),
                    "text": chunk.text,
                })
                if not sent:
                    return
            await self._safe_send({"type": "tts_end"})
        except asyncio.CancelledError:
            logger.info("TTS cancelled (barge-in or disconnect)")
            raise

        if not is_engagement:
            await self._set_state("listening")

    # ─── Session finalization ───────────────────────────────────────────────

    async def _emergency_finalize(self):
        """
        Called in the `finally` block of run(). If the session is still in_progress
        but we have conversation history (disconnect mid-interview), persist the
        transcript and mark the session completed so the dashboard shows real data.
        Skips if finalization already ran (_state == 'done') or no session was set up.
        """
        if self.state == "done" or self.session is None:
            return
        history = self.session_state.get("conversation_history", [])
        # Only bother if at least one candidate turn was captured
        candidate_turns = [e for e in history if e.get("role") == "candidate"]
        if not candidate_turns:
            return
        try:
            # Build transcript from conversation history.
            # Skip the very first AI entry unconditionally — it is always the
            # greeting/intro, never a real interview question.  Text-equality
            # matching was fragile and caused the formatter to stall when the
            # stored greeting didn't exactly match the history entry.
            transcript_formatted = []
            q_idx = 0
            pending_question: str | None = None
            first_ai_seen = False
            for entry in history:
                if entry["role"] == "ai":
                    if not first_ai_seen:
                        first_ai_seen = True
                        continue  # skip greeting unconditionally
                    pending_question = entry["content"]
                elif entry["role"] == "candidate" and pending_question is not None:
                    transcript_formatted.append({
                        "question_index": q_idx,
                        "question": {"question_text": pending_question},
                        "answer": entry["content"],
                    })
                    pending_question = None
                    q_idx += 1

            duration_seconds = None
            started_at = self.session.get("started_at")
            if started_at:
                try:
                    started_dt = datetime.datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    now_dt = datetime.datetime.now(datetime.timezone.utc)
                    duration_seconds = int((now_dt - started_dt).total_seconds())
                except Exception:
                    pass

            summary = await self._generate_ws_summary(history)
            update_data: dict = {
                "status": "completed",
                "transcript": transcript_formatted,
                "interview_summary": json.dumps(summary),
            }
            if duration_seconds is not None:
                update_data["duration_seconds"] = duration_seconds

            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self._supabase.table("video_interview_sessions")
                .update(update_data)
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
            # Try to notify the client so it can upload the recording
            await self._safe_send({"type": "interview_complete", "summary": summary})
            logger.info("Emergency finalized session %s (%d turns saved)", self.session["id"], len(transcript_formatted))
        except Exception as exc:
            logger.error("Emergency finalize failed for session %s: %s", self.session["id"], exc)

    async def _finalize_session(self):
        closing = "Thank you so much for your time today. We'll be in touch soon. Best of luck!"
        self._tts_task = asyncio.create_task(
            self._stream_tts_and_send(closing, is_engagement=False)
        )
        await self._tts_task

        history = self.session_state.get("conversation_history", [])
        summary = await self._generate_ws_summary(history)

        # Format transcript as [{question_index, question, answer}] for the UI.
        # Skip the first AI entry unconditionally — it is always the greeting.
        # Text-equality matching against session_state["greeting"] was fragile;
        # the first AI history entry is always and only the greeting, so a positional
        # skip is both simpler and more reliable.
        transcript_formatted = []
        q_idx = 0
        pending_question: str | None = None
        first_ai_seen = False
        for entry in history:
            if entry["role"] == "ai":
                if not first_ai_seen:
                    first_ai_seen = True
                    continue  # skip greeting
                pending_question = entry["content"]
            elif entry["role"] == "candidate" and pending_question is not None:
                transcript_formatted.append({
                    "question_index": q_idx,
                    "question": {"question_text": pending_question},
                    "answer": entry["content"],
                })
                pending_question = None
                q_idx += 1

        # Calculate duration from session start time
        duration_seconds = None
        started_at = self.session.get("started_at")
        if started_at:
            try:
                started_dt = datetime.datetime.fromisoformat(
                    started_at.replace("Z", "+00:00")
                )
                now_dt = datetime.datetime.now(datetime.timezone.utc)
                duration_seconds = int((now_dt - started_dt).total_seconds())
            except Exception:
                pass

        update_data: dict = {
            "status": "completed",
            "interview_summary": json.dumps(summary),  # store as JSON string for UI
            "transcript": transcript_formatted,
        }
        if duration_seconds is not None:
            update_data["duration_seconds"] = duration_seconds

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._supabase.table("video_interview_sessions")
            .update(update_data)
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

        await self._safe_send({"type": "interview_complete", "summary": summary})
        await self._set_state("done")
        # Give the client time to receive and process interview_complete + state=done
        # before closing the WS.  Without this delay the close frame can arrive before
        # the queued messages are processed, causing the client to reconnect instead of
        # triggering the upload flow.
        await asyncio.sleep(2)
        if not self._closed:
            self._closed = True
            try:
                await self.ws.close()
            except Exception:
                pass

    async def _generate_ws_summary(self, history: list[dict]) -> dict:
        """Generate interview summary using LLM with correct field shapes for the WS flow."""
        transcript_lines = [
            f"{'AI' if h['role'] == 'ai' else 'Candidate'}: {h['content']}"
            for h in history
        ]
        transcript_text = "\n".join(transcript_lines)
        transcript_preview = transcript_text[:200]

        campaign_role = (self.campaign or {}).get("job_role", "the role")
        model = (self.campaign or {}).get("llm_model") or _VIDEO_INTERVIEW_MODEL

        prompt = f"""Evaluate this {campaign_role} interview transcript and return a JSON assessment.

Interview transcript:
{transcript_text}

Respond with ONLY valid JSON in this exact format:
{{
  "recommendation": "Strong recommend",
  "strengths": ["specific strength citing what candidate said"],
  "weaknesses": ["specific weakness citing what candidate said"],
  "overall_score": 90,
  "technical_score": 8,
  "communication_score": 7,
  "problem_solving": 8
}}

recommendation must be one of: "Strong recommend", "Recommend", "Consider", "Not recommended"
overall_score: Strong recommend=90, Recommend=75, Consider=50, Not recommended=25
technical_score, communication_score, problem_solving: integers 0-10
Strengths and weaknesses must cite specific transcript evidence, not generic statements."""

        try:
            result = await self._llm.generate_completion(
                prompt=prompt,
                model=model,
                system_prompt="You are a senior technical interviewer evaluating a candidate. Be objective and evidence-based. Return valid JSON only.",
                temperature=0.1,
                max_tokens=500,
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
