# Real-Time Video Interview — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Area:** Video Interview (Frontend + Backend)

---

## Context

The current video interview uses a **turn-based HTTP model**: the candidate records audio, POSTs it to the backend, waits for the full STT → LLM → TTS pipeline to complete, then receives a base64 audio blob. This feels like submitting a form, not attending an interview.

The goal is to replace this with a **real-time WebSocket-based flow** that feels like a Google Meet interview: the AI interviewer speaks naturally, the candidate responds, the AI follows up based on the answer — all with minimal latency, barge-in support, and graceful handling of mic-off, silence, and connection drops.

The separate `/conversational-interview` route is **merged into** this flow and removed. There will be one unified video interview experience.

---

## What Changes

### Removed
| Item | Reason |
|---|---|
| `POST /api/v1/video-interviews/sessions/turn` | Replaced by WebSocket |
| `POST /api/v1/video-interviews/sessions/turn/audio` | Replaced by WebSocket |
| `/conversational-interview/[token]` route | Merged into video interview |
| `ConversationManager` service | Replaced by `VideoInterviewWSHandler` |
| Full base64 audio in HTTP response | Replaced by streaming TTS chunks over WS |

### Added / Modified
| Item | Purpose |
|---|---|
| `WS /api/v1/video-interviews/ws/{token}` | Single persistent connection for entire interview |
| `VideoInterviewWSHandler` service | Manages WebSocket session state, audio pipeline, engagement logic |
| `StreamingTTSService` (modified) | Made genuinely streaming via sentence-splitting + per-sentence Piper subprocess |
| Improved AudioWorklet VAD | 20ms frame processing, dynamic noise calibration |
| Barge-in interruption | Candidate speech cancels in-flight TTS generator server-side |
| Silence engagement prompts | AI speaks after 8s / 15s silence |
| Mic-off detection + prompt | Client fires `mic_off` event, AI reminds candidate to unmute |
| Ping/pong heartbeat | 10s interval, auto-reconnect up to 3 attempts |
| Collapsible transcript panel | CC button in control bar toggles transcript overlay |

---

## Architecture

```
BROWSER                                    FASTAPI
───────                                    ───────
VRM Avatar (Three.js + @pixiv/three-vrm)
  └─ lip-sync via AudioAnalyser

MediaRecorder (video/webm)                 WS /ws/{token}
  └─ continuous background recording         └─ VideoInterviewWSHandler
                                                  ├─ AudioBuffer collector
AudioWorklet (VAD)                               ├─ faster-whisper (STT)
  ├─ 20ms frames, dynamic threshold             ├─ Ollama LLM (streaming)
  ├─ speech_start → begin buffering             ├─ Piper TTS (sentence-streaming)
  └─ end_of_speech → send audio_end             ├─ Silence / mic-off engagement
                                                 ├─ Ping/pong heartbeat
WebSocket Client  ◄──────────────────────►  └─ Session state → Supabase DB
  ├─ audio_chunk / audio_end
  ├─ barge_in / mic_off / mic_on
  └─ pong

On interview end:
  Client waits for recording upload spinner → Supabase Storage (blocking, ~2s)
  Server saves transcript + LLM evaluation → DB, sends interview_complete
```

---

## WebSocket URL — Proxy Strategy

Next.js `rewrites()` is HTTP-only and **does not upgrade WebSocket connections**. The WS connection must therefore go directly to the FastAPI backend.

### URL resolution
```typescript
// frontend/src/lib/api/video-interviews.ts
export function getVideoInterviewWSUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'
  return `${base}/api/v1/video-interviews/ws/${token}`
}
```

Add to `frontend/.env.local` (development):
```
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Add to production env (nginx/reverse proxy must forward WS upgrades):
```
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

The `next.config.ts` rewrites are **not changed** — they continue to serve all other `/api/*` HTTP routes.

---

## WebSocket Message Protocol

### Client → Server

| Message | When sent |
|---|---|
| `{ type: "audio_chunk", data: base64 }` | Continuously while candidate is speaking. `data` is raw PCM16 mono 16kHz, no WAV header, base64-encoded. Each chunk = one 20ms AudioWorklet frame (320 samples × 2 bytes = 640 bytes raw, ~853 chars base64). |
| `{ type: "audio_end" }` | VAD detected end of speech (800ms silence) |
| `{ type: "barge_in" }` | Candidate starts speaking while AI is talking |
| `{ type: "mic_off" }` | Candidate mutes microphone |
| `{ type: "mic_on" }` | Candidate unmutes microphone |
| `{ type: "pong" }` | Reply to server ping (within 5s) |
| `{ type: "disconnect" }` | Client closing cleanly |

### Server → Client

| Message | When sent |
|---|---|
| `{ type: "state", value: "greeting"\|"listening"\|"thinking"\|"speaking"\|"engaging" }` | On every state transition |
| `{ type: "transcript", text: string }` | After STT completes (candidate's words) |
| `{ type: "tts_chunk", audio: base64, text: string }` | Streamed TTS fragment. `audio` is a complete WAV (16kHz mono 16-bit PCM with 44-byte header) for that sentence, decodable via `AudioContext.decodeAudioData()`. `text` is the sentence text for transcript assembly. |
| `{ type: "tts_end" }` | All TTS chunks sent for current speaking turn — server transitions to LISTENING |
| `{ type: "engagement_prompt", reason: "silence"\|"mic_off" }` | Notifies client to show overlay banner. Server immediately follows with `tts_chunk` / `tts_end` for the engagement speech — same flow as a regular speaking turn. |
| `{ type: "ping" }` | Every 10s — client must reply pong within 5s |
| `{ type: "interview_complete", summary: InterviewSummary }` | Session finished — triggers recording upload then redirect to /submitted |

### `InterviewSummary` shape
```typescript
interface InterviewSummary {
  session_id: string
  overall_score: number          // 0-100
  recommendation: string         // "Strong recommend" | "Recommend" | "Consider" | "Not recommended"
  strengths: string[]
  weaknesses: string[]
  transcript_preview: string     // first 200 chars of assembled transcript. Assembly: join conversation_history entries as "{role}: {content}" separated by "\n", take first 200 characters. Role labels: "AI" for role=="ai", "Candidate" for role=="candidate".
}
// Full transcript and recording URL are fetched from DB on the dashboard.
// Client does NOT need to store the summary — it redirects to /submitted immediately.
```

---

## Interview State Machine

```
connect
  │
  ▼
GREETING ──(tts_end)──► LISTENING ──(audio_end)──► THINKING ──(LLM done)──► SPEAKING
                            ▲                                                     │
                            │◄──────────────────────────────────(tts_end)────────┘
                            │
                         ENGAGING ──(tts_end)──► LISTENING
                         (silence / mic-off prompt — same TTS flow as SPEAKING)

Barge-in:   SPEAKING ──(barge_in msg)──► cancel TTS generator ──► LISTENING
Disconnect: any state ──► client reconnect overlay ──► on reconnect: resume from LISTENING
                                                        (if mid-SPEAKING: re-send last question)
COMPLETE:   server sends interview_complete, closes socket
```

**Transition rules:**
- `GREETING → LISTENING`: triggered by `tts_end` after the opening greeting TTS completes. Server sends `{ type: "state", value: "listening" }` immediately after.
- `ENGAGING → LISTENING`: triggered by `tts_end` after the engagement TTS completes. Silence timer resets.
- `COMPLETE`: triggered when `turn_index >= max_questions`. Server generates closing statement TTS, then summary, then sends `interview_complete`.

---

## VAD — Voice Activity Detection

### AudioWorklet (replaces 100ms polling)

File: `frontend/public/worklets/vad-processor.js`

- Processes audio in **20ms frames** (320 samples at 16kHz) via `AudioWorkletProcessor`
- Computes **RMS + zero-crossing rate** per frame
- **Dynamic threshold calibration**: on `init` message, samples 1.5s of ambient noise, sets `speech_threshold = ambient_rms * 3`
- `speech_start`: 3 consecutive frames above `speech_threshold` → post `{ type: 'speech_start' }` to main thread; begin posting `{ type: 'chunk', data: Float32Array }` each frame
- `end_of_speech`: **800ms** of consecutive frames below threshold after speech → post `{ type: 'end_of_speech' }` to main thread

Main thread on receiving worklet messages:
- `speech_start`: note that candidate is speaking (for barge-in check)
- `chunk`: encode `Float32Array` → PCM16 (clamp to int16 range) → base64 → send `audio_chunk` over WS
- `end_of_speech`: send `{ type: "audio_end" }` over WS

### Server-side audio assembly
On `audio_end`, `VideoInterviewWSHandler`:
1. Concatenates all raw PCM16 frames received since last `audio_end`
2. Prepends a 44-byte WAV header (16kHz, mono, 16-bit PCM)
3. Passes the WAV bytes **directly** to `STTService.transcribe()` — skips `convert_to_wav16k()` since the format is already guaranteed correct by the AudioWorklet (16kHz mono PCM16). This avoids an unnecessary ffmpeg re-encode. **WAV header construction:** no existing helper in the codebase does this (`AudioProcessingService` delegates to ffmpeg). Write the 44-byte RIFF/PCM header from scratch using `struct.pack`: ChunkID=`b"RIFF"`, Format=`b"WAVE"`, Subchunk1ID=`b"fmt "`, PCM format=1, channels=1, sample_rate=16000, bits_per_sample=16, data_size=`len(pcm_bytes)`. Same pattern applies in `StreamingTTSService` when prepending the header to Piper's raw PCM output.
4. `STTService.transcribe()` is synchronous (blocks on `WhisperModel.transcribe()`). Wrap in `asyncio.get_event_loop().run_in_executor(None, stt_service.transcribe, wav_bytes)` so the event loop is not blocked during the 1-3s transcription. This is required to avoid freezing other concurrent WebSocket sessions.

### Barge-in Detection (separate path)
- Main thread communicates current server state to the worklet via `workletNode.port.postMessage({ type: 'set_mode', mode: 'speaking' | 'listening' })` on each `state` message received from the server. The worklet stores this and switches thresholds accordingly.
- While worklet mode is `speaking`, use `barge_threshold = speech_threshold * 0.5`
- On 2 consecutive frames above `barge_threshold`: main thread immediately:
  1. Stops all scheduled `AudioBufferSourceNode`s (call `.stop()` on each, clear the playback queue array)
  2. Sends `{ type: "barge_in" }` over WS
  3. Starts recording audio_chunk frames normally
- Server cancels TTS async generator via `asyncio.CancelledError`, transitions to LISTENING

---

## Engagement Logic (Server-side)

Tracked per WebSocket session in `VideoInterviewWSHandler` via `asyncio` tasks:

| Timer | Action |
|---|---|
| 8s silence in LISTENING | Send `engagement_prompt` (reason: "silence"), then `tts_chunk`/`tts_end` for: *"Take your time — I'm listening whenever you're ready."* Transition: LISTENING → ENGAGING → LISTENING. The silence timer **pauses** during ENGAGING (while TTS plays). |
| 15s cumulative silence | 15 seconds of accumulated silence **excluding** ENGAGING time. Concretely: 8s fires the first prompt; after ENGAGING ends and LISTENING resumes, the timer continues from 8s; 7 more seconds of silence → 15s total → second prompt. Transition: same as above. |
| 30s cumulative silence | Mark session `abandoned`, close WebSocket cleanly. |
| `mic_off` received | Cancel silence timer. Send `engagement_prompt` (reason: "mic_off") + TTS: *"It looks like your microphone is turned off. Please unmute to continue."* |
| `mic_on` received | Reset silence timer to 0, resume LISTENING state |

---

## Connection Health

- Server sends `{ type: "ping" }` every **10 seconds** via asyncio task
- Client must reply `{ type: "pong" }` within **5 seconds**
- No pong → server closes WebSocket with code 1001 (Going Away), marks session `abandoned`
- Client `onclose` handler: shows reconnect overlay, attempts reconnect up to **3 times** with exponential backoff (1s, 2s, 4s) using `getVideoInterviewWSUrl(token)`
- **Reconnect detection** (server-side): on new WS connection for a token, `VideoInterviewWSHandler.run()` first calls `VideoInterviewService.get_candidate_by_token(token)` to resolve `candidate_id`. Note: `get_candidate_by_token()` raises `ValueError` if `candidate.status == "completed"` or `"failed"`. If this raises, send `{ type: "interview_complete" }` with a stub summary (or an `{ type: "error", message: "Interview already completed" }` message) and close the socket — do not drop the connection silently. If authentication succeeds, query `video_interview_sessions WHERE candidate_id = {candidate_id} AND status = 'in_progress' ORDER BY created_at DESC LIMIT 1`. If found: loads `session_state`, resumes from `session_state["last_turn_index"]`, re-sends last unanswered question as TTS. If not found: creates a new session via `VideoInterviewService.start_session()`.

---

## Streaming TTS — Required Changes to `StreamingTTSService`

**Problem:** Current `stream_synthesize()` calls `process.communicate()` which buffers all output before returning — no real streaming.

**Fix** in `backend/app/services/streaming_tts_service.py`:

Split LLM output text into sentences using: `/(?<=[.!?])\s+/` for hard splits, and treat a `,` as a soft pause boundary only when the accumulated sentence so far contains 10 or more words. Example: `"I'd like to ask about your experience with distributed systems, specifically around consensus algorithms."` splits after "systems," (10+ words before the comma). For each sentence:
1. Spawn a Piper subprocess: `piper --model {model} --output-raw`
2. Write sentence text to `stdin`, close it
3. Read raw PCM16 output from `stdout` (`await process.stdout.read()`)
4. Prepend 44-byte WAV header (16kHz mono 16-bit)
5. Yield `TTSChunk(audio=wav_bytes, text=sentence, word_end=0.0, is_final=False)`

After all sentences: yield `TTSChunk(audio=b"", text="", word_end=0.0, is_final=True)`.

**Note:** The existing `TTSChunk` dataclass requires `word_end: float`. In the new sentence-streaming flow, per-word timing is not available — pass `word_end=0.0` for all chunks. The `word_end` field is unused by `VideoInterviewWSHandler` (lip-sync is driven by the client-side AudioAnalyser, not word timestamps).

**Remove entirely:** the `word_timestamps` parameter, the `--json` Piper flag, and the `_parse_json_output` method from `StreamingTTSService`. The sentence-splitting subprocess loop is the only code path in the modified service. The reason to remove the `--json` branch is that `process.communicate()` buffers the entire Piper output before returning, which conflicts with per-sentence streaming. The `async def` signature and `AsyncGenerator[TTSChunk, None]` return type stay unchanged.

`VideoInterviewWSHandler` sends each yielded chunk as `{ type: "tts_chunk", audio: base64(wav_bytes), text: sentence }` immediately, then `{ type: "tts_end" }` on `is_final=True`.

This gives sentence-level streaming latency (~200-400ms per sentence) without requiring Piper to support progressive stdout.

---

## Database — Session State Schema

No new migration required. The existing `video_interview_sessions.session_state JSONB` column is sufficient.

**Session state shape** (written to DB after each turn):
```json
{
  "current_index": 3,
  "max_questions": 7,
  "last_turn_index": 2,
  "greeting": "Welcome! I'm Alex...",
  "conversation_history": [
    { "role": "ai", "content": "Tell me about a challenging project..." },
    { "role": "candidate", "content": "Last year I built a real-time pipeline..." }
  ]
}
```

`last_turn_index` = index of the last **completed** turn (AI asked + candidate answered). Used to resume on reconnect.

**Max questions:** read as `len(campaign["questions"])` from the campaign row. No separate `num_questions` field needed — the questions array length is the source of truth.

---

## Redis / Connection Limiting

Redis is already in `docker-compose.yml`. For the single-connection-per-token guard, use a simple **in-memory dict** in the WS handler module (not Redis) since this is a single-process Uvicorn deployment:

```python
# backend/app/services/video_interview_ws_handler.py
_active_connections: dict[str, WebSocket] = {}  # token → active websocket
```

On new connection: if `token` already in `_active_connections`, close the old socket (code 4000, "replaced by new connection") before adding the new one. This covers tab refresh / reconnect scenarios without requiring Redis.

If the deployment ever goes multi-process, replace with Redis; document this in a comment.

---

## Backend: `VideoInterviewWSHandler`

New service at `backend/app/services/video_interview_ws_handler.py`. Responsibilities:

1. **Authenticate token** → load candidate + campaign from DB via `VideoInterviewService`
2. **Reconnect detection** → check for `in_progress` session for candidate; load or create
3. **Manage session state** in memory during connection, persist to DB after each completed turn
4. **Audio pipeline**: collect `audio_chunk` PCM frames → on `audio_end`: prepend WAV header → STT → LLM (streaming, sentence-split) → TTS per sentence → send `tts_chunk`
5. **Barge-in**: cancel TTS async generator on `barge_in` → transition to LISTENING
6. **Engagement timers**: asyncio tasks, cancel/reset on speech activity
7. **Heartbeat**: asyncio task, close on pong timeout
8. **Session close**: generate summary, save to DB, send `interview_complete`

Reuses existing:
- `AudioProcessingService.convert_to_wav16k()` — `backend/app/services/audio_processing_service.py`
- `STTService.transcribe()` — `backend/app/services/stt_service.py`
- `StreamingTTSService.stream_synthesize()` — `backend/app/services/streaming_tts_service.py` *(modified — see above)*
- `LLMOrchestrator.generate_completion()` — `backend/app/services/llm_orchestrator.py`
- `VideoInterviewService._generate_conversational_question()` — `backend/app/services/video_interview_service.py`
- `VideoInterviewService._generate_summary()` — same file

---

## Backend: WebSocket Endpoint

New endpoint added to `backend/app/api/v1/video_interviews.py`:

```python
@router.websocket("/ws/{token}")
async def video_interview_websocket(websocket: WebSocket, token: str):
    handler = VideoInterviewWSHandler(websocket, token)
    await handler.run()
```

---

## Frontend: `video-interview/[token]/page.tsx`

Replace HTTP turn logic with WebSocket. Key changes:

### WebSocket lifecycle
```typescript
const wsUrl = getVideoInterviewWSUrl(token)  // from lib/api/video-interviews.ts
const ws = new WebSocket(wsUrl)
ws.onmessage = (e) => handleServerMessage(JSON.parse(e.data))
ws.onclose = () => handleDisconnect()
```

### AudioWorklet VAD
- Load `public/worklets/vad-processor.js` via `AudioContext.audioWorklet.addModule()`
- Worklet posts `{ type: 'speech_start' | 'end_of_speech' | 'chunk', data?: Float32Array }` to main thread
- Main thread: `Float32Array` → clamp/scale to int16 → `Int16Array` → `Uint8Array` → base64 → send `audio_chunk`

### Avatar audio playback (sentence-streaming)
- Each `tts_chunk.audio` (base64 WAV) is decoded via `audioContext.decodeAudioData()`
- The scheduler creates an `AudioBufferSourceNode` per decoded buffer, connects it to the destination, and calls `.start(scheduledTime)` — back-to-back with no gaps
- **The FIFO queue stores `AudioBufferSourceNode` references** (not `AudioBuffer` data objects). `AudioBuffer` has no `.stop()` method; storing nodes is required for barge-in cleanup.
- `AudioAnalyser` on the destination node feeds lip-sync (existing VRMAvatar approach)
- **On barge-in**: iterate the node queue, call `.stop()` on each `AudioBufferSourceNode`, clear the queue array. Do NOT suspend/resume `AudioContext` — let it keep running for VAD.

### UI state
```typescript
type InterviewState = 'loading' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'engaging' | 'done' | 'error'
```

Status badge in top-right updates on each `state` message.

### Collapsible transcript
- `showTranscript` boolean state, toggled by CC button in control bar
- Transcript panel slides up from below avatar using CSS `transition: max-height 300ms ease`
- When open, avatar `transform: scale(0.85)` to make room
- Entries appended: `transcript` message → candidate line; `tts_end` → AI line (text assembled from `tts_chunk.text` fragments during the turn). **Track a boolean `isEngagementTurn` flag**: set to `true` when an `engagement_prompt` message is received, reset to `false` on the following `tts_end`. Do not append to the transcript when `isEngagementTurn` is true — engagement speech is UI feedback, not interview content.

### Overlays (on top of avatar, auto-dismiss after TTS ends)
| Trigger | Overlay |
|---|---|
| `engagement_prompt` reason=silence | Amber banner: *"Take your time — I'm listening whenever you're ready"* |
| `engagement_prompt` reason=mic_off | Amber banner + `MicrophoneSlashIcon`: *"Mic is off — please unmute to continue"* |
| WebSocket disconnect | Red banner: *"Connection lost — reconnecting… (attempt 2/3)"* |

### Control bar (bottom, anchored) — Heroicons solid set
| Control | Icon | Behaviour |
|---|---|---|
| Mic toggle | `MicrophoneIcon` / `MicrophoneSlashIcon` | Toggles mic track; sends `mic_off` / `mic_on` over WS; live waveform bars animate on button when VAD detects speech |
| Camera toggle | `VideoCameraIcon` / `VideoCameraSlashIcon` | Toggles video track on/off |
| End interview | `PhoneXMarkIcon` | Shows confirm dialog → stops recording → uploads blob (shows spinner) → redirects to /submitted |
| Transcript | `ChatBubbleLeftRightIcon` | Toggles transcript panel; active: indigo filled background |

---

## Recording — Upload Flow

- `MediaRecorder` (video/webm) runs throughout the interview
- On `interview_complete` message OR End button confirmed:
  1. Call `mediaRecorder.stop()` → collect all blobs into a single `Blob`
  2. Show **upload spinner overlay** ("Saving your interview recording…")
  3. Await `uploadVideoRecording(sessionId, blob)` — typically 1-3s
  4. On success: redirect to `/video-interview/{token}/submitted`
  5. On upload failure: show error toast, offer retry; do not redirect until upload succeeds or candidate explicitly skips

This avoids the lost-upload race condition from a non-blocking background upload.

---

## Files to Create / Modify

### New
| File | Purpose |
|---|---|
| `backend/app/services/video_interview_ws_handler.py` | Core WS session handler |
| `frontend/public/worklets/vad-processor.js` | AudioWorklet VAD processor |

### Modified
| File | Change |
|---|---|
| `backend/app/api/v1/video_interviews.py` | Add `@router.websocket("/ws/{token}")` endpoint |
| `backend/app/services/streaming_tts_service.py` | Replace `process.communicate()` with sentence-splitting + per-sentence Piper subprocesses for genuine streaming |
| `frontend/src/app/video-interview/[token]/page.tsx` | Replace HTTP turn loop with WebSocket; AudioWorklet VAD; sentence-streaming TTS playback; transcript toggle; overlays; control bar icons |
| `frontend/src/lib/api/video-interviews.ts` | Add `getVideoInterviewWSUrl(token)` helper |
| `frontend/.env.local` (and production env) | Add `NEXT_PUBLIC_WS_URL` |

### Removed (after validation)
| File | Reason |
|---|---|
| `frontend/src/app/conversational-interview/` | Merged into video interview |
| `backend/app/services/conversation_manager.py` | Replaced by VideoInterviewWSHandler |

---

## Conversational LLM Behaviour

- On each turn: LLM receives full `conversation_history` + campaign job role + difficulty + topics
- Generates a **follow-up question** based on the candidate's answer
- Prompt: ask one question at a time, follow up naturally, do not repeat questions
- Reuses `VideoInterviewService._generate_conversational_question()`
- Max turns = `len(campaign["questions"])` from campaign row. **Important:** `VideoInterviewWSHandler` calls `VideoInterviewService.start_session()` for DB record creation and to get the opening greeting (the method calls `_generate_conversational_start()` which returns a `greeting` string — use this as the first TTS content). After `start_session()` returns, overwrite `session_state["max_questions"]` with `len(campaign["questions"])` and re-persist to DB. Do not trust the value written by `start_session()` — that method derives `max_questions` from `interview_style` due to a pre-existing bug.
- On final turn: generates closing statement + calls `_generate_ws_summary()` (see below) → persists to DB

### Summary Generation — `_generate_ws_summary()`

The existing `VideoInterviewService._generate_summary()` uses `strong_hire|hire|maybe|no_hire` labels and does not return an `overall_score`. **Do not reuse it for the WebSocket flow.**

Instead, `VideoInterviewWSHandler` defines its own `_generate_ws_summary()` method that prompts the LLM to return:

```json
{
  "overall_score": 72,
  "recommendation": "Recommend",
  "strengths": ["Clear communication", "Strong system design knowledge"],
  "weaknesses": ["Limited experience with distributed tracing"],
  "transcript_preview": "Welcome! I'm Alex..."
}
```

`recommendation` values: `"Strong recommend"`, `"Recommend"`, `"Consider"`, `"Not recommended"` — matching the existing `VideoInterviewService` deterministic label logic for consistency on the dashboard.

`overall_score` is derived deterministically from `recommendation` in the prompt instructions (Strong recommend → 85-100, Recommend → 65-84, Consider → 40-64, Not recommended → 0-39) to reduce LLM variance.

---

## Verification

1. **Direct WS connection**: open `ws://localhost:8000/api/v1/video-interviews/ws/{token}` in Postman WS client — confirm `state: greeting` arrives, TTS chunks stream in as multiple separate messages (not one large blob)
2. **Browser WS proxy**: open the candidate interview page in browser — confirm DevTools Network tab shows WS connection to `ws://localhost:8000` (not through Next.js)
3. **Full interview flow**: complete a 3-question interview end-to-end — confirm transcript + evaluation saved in DB, recording uploaded to Supabase Storage, dashboard shows session with playback link
4. **Barge-in**: while TTS is playing, send `{ type: "barge_in" }` via WS client — confirm avatar audio stops, state transitions to `listening` within 100ms
5. **Silence engagement**: stay silent for 8s in LISTENING — confirm engagement TTS plays and amber overlay appears
6. **Mic-off**: click mute button — confirm `mic_off` sent, TTS reminder plays, mic-slash overlay appears
7. **Connection drop + resume**: close browser tab mid-interview, reopen same URL — confirm session resumes at correct turn index
8. **Recording upload**: verify upload spinner appears after interview ends and recording appears in Supabase Storage bucket
