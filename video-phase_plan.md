# Anti-Cheating Video Proctoring System - Implementation Plan

## 🎯 CURRENT FOCUS: CODING INTERVIEWS ONLY

**User Decision:** Implement video proctoring for coding interviews first. Voice interview video recording will be implemented in a separate phase later.

---

## Executive Summary

Add comprehensive video proctoring and anti-cheating measures to **Coding Interviews** with:
- **Webcam recording** of candidate's face throughout the interview
- **Screen recording** to monitor candidate's screen activity (desktop only)
- **Pre-flight permission checks** before interview starts
- **Free/open-source solutions** to minimize costs (MediaRecorder API)
- **Automatic recording storage** in Supabase Storage
- **Real-time face detection** with TensorFlow.js BlazeFace
- **Post-interview AI analysis** with Ollama llava:7b vision model
- **Mobile support** with adaptive recording (webcam-only on phones)

---

## Current State Analysis

### ✅ What You Already Have

**1. Comprehensive Anti-Cheating System (Client-Side)**
- **File:** `frontend/src/lib/anti-cheating-enhanced.ts`
- **30+ Activity Trackers:**
  - Keystroke dynamics analysis (detects AI/bot typing)
  - Browser fingerprinting (FingerprintJS)
  - DevTools detection
  - VM/Emulator detection
  - Tab switching, copy/paste, fullscreen monitoring
  - Mouse leave, idle detection
  - Screenshot attempt detection
  - Mobile: split-screen, orientation, network monitoring
- **Risk Scoring System:** Low (<50), Medium (50-99), High (100-149), Critical (≥150)
- **Database Logging:** All activities logged to `session_activities` table

**2. Video Interview Infrastructure (Daily.co)**
- **Already integrated** for live video interviews
- **Free tier** with local recording
- **Files:**
  - `backend/app/services/video_interview_service.py` - Daily.co integration
  - `frontend/src/components/video/VideoRoom.tsx` - Video room component
- **Features:** Webcam, screen sharing, recording, transcription (planned)
- **Storage:** Supabase Storage (`interview-recordings` bucket)

**3. Voice Interview Audio Recording (Vapi.ai)**
- **Audio-only** recording currently
- **Misleading UI notice** says "screen is continuously captured" but NOT implemented
- **Storage:** Vapi.ai temporary storage → Downloaded to Supabase

**4. Storage Infrastructure**
- **Supabase Storage** already configured
- **Buckets:** `interview-recordings` (private)
- **Signed URLs** with expiration (7 days for video interviews)
- **File organization:** `{interview_type}/{candidate_id}/{timestamp}_{filename}`

### ❌ What's Missing (FOR CODING INTERVIEWS)

1. **No video proctoring for coding interviews** (only client-side tracking)
2. **No screen recording for coding interviews**
3. **No webcam recording for coding interviews**
4. **No pre-flight permission verification** before interview starts
5. **No real-time face detection** during interview
6. **No AI-powered post-interview video analysis**

**Note:** Voice interview video recording is NOT in scope for this phase - will be addressed later.

---

## Free/Open-Source Video Proctoring Options

### Option 1: **MediaRecorder API + WebRTC** (RECOMMENDED ⭐)

**What it is:**
- Built-in browser API for recording media streams
- No third-party dependencies
- Works in all modern browsers

**Pros:**
- ✅ **100% Free** - no external services needed
- ✅ **No API limits** or quotas
- ✅ **Privacy-friendly** - all recording happens client-side
- ✅ **Already familiar** - used in your Daily.co integration
- ✅ **Dual recording** - can record webcam + screen simultaneously
- ✅ **Chunk upload** - stream video chunks during interview

**Cons:**
- ⚠️ **Large file sizes** - video files are 50-200MB per hour
- ⚠️ **Browser compatibility** - requires modern browsers
- ⚠️ **No AI analysis** - need separate face detection library
- ⚠️ **Client-side only** - candidates can potentially tamper

**Technical Stack:**
```javascript
// Webcam recording
const webcamStream = await navigator.mediaDevices.getUserMedia({
  video: { width: 640, height: 480, frameRate: 15 },
  audio: false
})

// Screen recording
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: { displaySurface: 'browser', frameRate: 5 }
})

// Record both streams
const webcamRecorder = new MediaRecorder(webcamStream, {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 300000  // 300 kbps
})

const screenRecorder = new MediaRecorder(screenStream, {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 500000  // 500 kbps
})
```

**Chunk Upload & Merging Strategy:**

**During Interview (Continuous Upload):**
```
Recording starts → MediaRecorder records for 30 seconds → Chunk uploaded → Repeat
```
- Webcam chunks: `coding-videos/{submission_id}/webcam/chunk-0000.webm`, `chunk-0001.webm`, etc.
- Screen chunks: `coding-videos/{submission_id}/screen/chunk-0000.webm`, `chunk-0001.webm`, etc.
- Each chunk uploaded as soon as it's ready (non-blocking)
- If upload fails, chunk is retried or stored locally and uploaded on next interval

**After Interview Submission (Automatic Merge):**
```
Interview submitted → finalize_session() called → FFmpeg merges chunks → Single video file created
```
- Backend downloads all chunks from Supabase Storage
- Uses FFmpeg to concatenate chunks into single video file
- Final files: `coding-videos/{submission_id}/webcam-final.webm` and `screen-final.webm`
- Original chunks deleted to save storage space
- Upload status updated to `completed`

**For Reviewers (Playback):**
- Reviewer opens submission → Backend generates signed URLs for final videos
- Video player shows **single merged video** (not individual chunks)
- Can play webcam and screen recordings side-by-side
- Can seek to any timestamp (e.g., jump to 15:30 mark)
- Signed URLs expire after 1 hour for security

**Visual Flow:**
```
DURING INTERVIEW (Continuous Upload)
┌─────────────────────────────────────────────────────────────┐
│ Candidate's Browser                                         │
│ ┌─────────────┐  Record 30s  ┌────────────────┐            │
│ │ MediaRecorder│─────────────→│ Chunk 0 (Blob) │──Upload──→│
│ └─────────────┘               └────────────────┘            │
│       ↓ Continue                                            │
│ ┌─────────────┐  Record 30s  ┌────────────────┐            │
│ │ MediaRecorder│─────────────→│ Chunk 1 (Blob) │──Upload──→│
│ └─────────────┘               └────────────────┘            │
│       ↓ Continue                                            │
│ ┌─────────────┐  Record 30s  ┌────────────────┐            │
│ │ MediaRecorder│─────────────→│ Chunk 2 (Blob) │──Upload──→│
│ └─────────────┘               └────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                                                 ↓
                               ┌──────────────────────────────┐
                               │ Supabase Storage             │
                               │ /webcam/chunk-0000.webm      │
                               │ /webcam/chunk-0001.webm      │
                               │ /webcam/chunk-0002.webm      │
                               └──────────────────────────────┘

AFTER SUBMISSION (Automatic Merge)
┌──────────────────────────────────────────────────────────────┐
│ Backend Service (finalize_session)                          │
│                                                              │
│ 1. Download all chunks from Supabase                        │
│    ↓                                                         │
│ 2. Create filelist.txt:                                     │
│    file 'chunk-0000.webm'                                   │
│    file 'chunk-0001.webm'                                   │
│    file 'chunk-0002.webm'                                   │
│    ↓                                                         │
│ 3. Run FFmpeg merge:                                        │
│    ffmpeg -f concat -safe 0 -i filelist.txt \              │
│           -c copy webcam-final.webm                         │
│    ↓                                                         │
│ 4. Upload merged file to Supabase                           │
│    ↓                                                         │
│ 5. Delete individual chunks to save space                   │
└──────────────────────────────────────────────────────────────┘
                                ↓
                ┌──────────────────────────────────┐
                │ Supabase Storage (Final)         │
                │ /webcam-final.webm (merged)      │
                │ /screen-final.webm (merged)      │
                └──────────────────────────────────┘

REVIEWER PLAYBACK
┌──────────────────────────────────────────────────────────────┐
│ Reviewer UI                                                  │
│ ┌────────────────────────┬────────────────────────┐         │
│ │ Webcam Video           │ Screen Video           │         │
│ │ (webcam-final.webm)    │ (screen-final.webm)    │         │
│ │ ▶ 00:15:30 / 01:00:00 │ ▶ 00:15:30 / 01:00:00 │         │
│ └────────────────────────┴────────────────────────┘         │
│ [Timeline with suspicious moments marked]                   │
└──────────────────────────────────────────────────────────────┘
```

**What Happens If Things Go Wrong:**

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| **Internet disconnects during upload** | Chunks buffered locally until connection restored | Retry upload when online |
| **Browser crashes mid-interview** | Uploaded chunks safe in Supabase, newer chunks lost | Partial recording available |
| **Candidate closes browser tab** | Recording stops, uploaded chunks preserved | Merge with available chunks only |
| **FFmpeg merge fails** | Original chunks retained, status = 'failed' | Manual retry or admin intervention |
| **Chunk upload fails 3 times** | Skip that chunk, continue with next | Warning logged, gap in recording |

**Why Chunked Upload Instead of Full Upload?**
1. **Resilience** - If interview interrupted, we have partial recording instead of nothing
2. **Progress visibility** - Candidate sees upload progress during interview
3. **Memory efficiency** - Don't hold entire video in browser RAM (would cause crashes)
4. **Network-friendly** - Small 30s chunks easier to upload on slow connections

---

## 🚀 Scalability & Concurrent Interviews

### How Multiple Candidates Are Handled Simultaneously

**Q: What if 50 candidates attend interviews at the same time?**

**A: Each candidate is completely isolated with their own video session:**

```
Candidate A (Interview Token: abc123)
├── Video Session ID: session-uuid-1
├── Supabase Storage Path: /coding-videos/submission-1/
│   ├── webcam/chunk-0000.webm
│   ├── webcam/chunk-0001.webm
│   └── screen/chunk-0000.webm
└── Analysis Queue: Pending (position #1)

Candidate B (Interview Token: def456)
├── Video Session ID: session-uuid-2  ← Different session!
├── Supabase Storage Path: /coding-videos/submission-2/  ← Different folder!
│   ├── webcam/chunk-0000.webm
│   ├── webcam/chunk-0001.webm
│   └── screen/chunk-0000.webm
└── Analysis Queue: Pending (position #2)

Candidate C (Interview Token: ghi789)
├── Video Session ID: session-uuid-3
├── Supabase Storage Path: /coding-videos/submission-3/
│   ├── webcam/chunk-0000.webm
│   └── screen/chunk-0000.webm
└── Analysis Queue: Pending (position #3)
```

**Key Points:**
- ✅ **Isolated sessions** - Each candidate gets unique `video_session_id`
- ✅ **Separate storage paths** - No file collisions (each submission has own folder)
- ✅ **Individual analysis** - Each video analyzed separately, results stored per submission
- ✅ **No shared state** - One candidate's recording doesn't affect another's

---

### Performance Optimization Strategies

#### 1. **Client-Side (Browser)**

**Problem:** Recording video uses browser resources (CPU/RAM/Network).

**Solutions:**
```
Optimizations Applied:
├── Video Resolution: 640x480 (not 1080p) → Saves 70% CPU
├── Frame Rate: 15fps webcam, 5fps screen → Saves 50% bandwidth
├── VP9 Codec: Better compression than H.264 → Saves 30% file size
├── Non-blocking uploads: Chunks upload in background → No UI freeze
└── Mobile detection: Skip screen recording on phones → Saves battery
```

**Impact:**
- Webcam recording: ~5-10% CPU usage
- Screen recording: ~3-5% CPU usage
- Total RAM: ~50-100MB
- Bandwidth: ~300 kbps webcam + 500 kbps screen = 800 kbps total

**Concurrent limit per browser:** ✅ No limit (each tab is independent)

---

#### 2. **Backend (FastAPI)**

**Problem:** Handling 50 concurrent chunk uploads.

**Solutions:**

**Async Upload Endpoints:**
```python
@router.post("/video-sessions/{session_id}/upload-webcam-chunk")
async def upload_webcam_chunk(
    session_id: str,
    sequence: int,
    file: UploadFile = File(...),
):
    """Non-blocking async upload - handles 100+ concurrent uploads."""
    chunk = await file.read()  # Async I/O

    # Upload to Supabase in background task
    background_tasks.add_task(
        storage_service.upload_chunk,
        session_id, chunk, sequence
    )

    return {"status": "uploading"}  # Returns immediately
```

**Database Connection Pooling:**
```python
# In backend/app/config.py
DATABASE_POOL_SIZE = 20  # Handle 20 concurrent DB connections
DATABASE_MAX_OVERFLOW = 10  # Allow 10 extra during peak
```

**FastAPI Async Workers:**
```bash
# Run with multiple workers for concurrency
uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8000
```

**Supabase Storage Rate Limits:**
- Free tier: 5GB bandwidth/month
- Pro tier ($25/month): Unlimited bandwidth
- No file upload rate limit (can handle 100+ concurrent uploads)

**Concurrent capacity:** ✅ **50-100 simultaneous interviews** without issues

---

#### 3. **Video Analysis Queue (Background Worker)**

**Problem:** Ollama video analysis is slow (2-5 minutes per 1-hour interview).

**Solutions:**

**Queued Processing (Not Real-Time):**
```
Interview Submissions:
┌────────────────────────────────────────────────────┐
│ Candidate A submits → Analysis status: "pending"  │
│ Candidate B submits → Analysis status: "pending"  │
│ Candidate C submits → Analysis status: "pending"  │
└────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────┐
│ Background Worker (runs every 5 minutes)            │
│                                                      │
│ 1. Pick oldest "pending" video                      │
│ 2. Update status to "processing"                    │
│ 3. Download video from Supabase                     │
│ 4. Extract frames (1 frame/10 seconds)              │
│ 5. Analyze each frame with Ollama llava:7b         │
│ 6. Generate report (attention score, risk level)    │
│ 7. Save to DB, update status to "completed"        │
│ 8. Repeat for next video                            │
└──────────────────────────────────────────────────────┘
```

**Processing Speed:**
- 1-hour interview → ~360 frames (1 per 10 seconds)
- Ollama processes ~1 frame/second
- Total analysis time: **~6 minutes per interview**

**Concurrent analysis capacity:**
- Single Ollama instance: 1 video at a time (sequential)
- Multiple Ollama instances (advanced): 3-5 videos in parallel

**Queue management:**
```python
# In video_analysis_worker.py
async def process_pending_analyses():
    # Get videos pending analysis
    pending_videos = service.get_pending_analysis(limit=1)  # Process 1 at a time

    for video_session in pending_videos:
        # Mark as processing so other workers skip it
        service.update_analysis_status(video_session['id'], 'processing')

        # Analyze video (takes ~6 minutes)
        analysis = analysis_service.analyze_interview_video(video_path)

        # Save results
        service.save_analysis_results(video_session['id'], analysis)
```

**Analysis timeline:**
- Candidate submits interview → Analysis queued
- Worker picks up video within 5 minutes
- Analysis completes in ~6 minutes
- **Total delay:** ~10-15 minutes after submission
- Reviewer sees analysis results when they check submission

**Scaling strategy:**
- If 50 candidates submit at once:
  - All 50 videos queued immediately
  - Worker processes 1 video every ~6 minutes
  - All 50 analyzed in ~5 hours
- For faster analysis: Run multiple Ollama instances in parallel (advanced setup)

---

### Per-Candidate Data Isolation

**Database Schema Ensures Isolation:**

```sql
-- Each video session linked to ONE submission
CREATE TABLE video_proctoring_sessions (
  id UUID PRIMARY KEY,
  submission_id UUID REFERENCES coding_submissions(id),  -- 1:1 relationship
  org_id UUID REFERENCES organizations(id),

  -- Webcam recording (unique per candidate)
  webcam_storage_path TEXT,  -- /coding-videos/submission-123/webcam-final.webm

  -- Analysis results (unique per candidate)
  attention_score INTEGER,
  suspicious_moments JSONB,
  risk_level TEXT
);

-- Each submission belongs to ONE candidate
CREATE TABLE coding_submissions (
  id UUID PRIMARY KEY,
  interview_id UUID,
  candidate_email TEXT,
  video_session_id UUID  -- Links to video_proctoring_sessions
);
```

**Analysis Report Scope:**
```python
# When generating analysis report:
def analyze_interview_video(self, video_path: str) -> dict:
    # Analyzes THIS video ONLY
    # Results saved to video_proctoring_sessions table with unique session_id
    # No cross-candidate contamination
```

**Reviewer Access:**
```python
@router.get("/submissions/{submission_id}/video-playback")
async def get_video_playback_urls(submission_id: str):
    # Returns ONLY this submission's videos
    # Cannot access other candidates' recordings
    # Permission check: Can only view submissions in your org
```

---

### Summary: Concurrent Interview Handling

| Aspect | Solution | Capacity |
|--------|----------|----------|
| **Client recording** | Each browser tab independent | Unlimited (1 per candidate) |
| **Chunk uploads** | Async FastAPI endpoints | 50-100 concurrent uploads |
| **Storage** | Supabase isolated paths | Unlimited candidates |
| **Video merge** | FFmpeg on-demand (per submission) | 10-20 concurrent merges |
| **Video analysis** | Background queue (sequential) | 1 video every 6 minutes |
| **Data isolation** | Unique session IDs per candidate | 100% isolated |

**Bottleneck:** Video analysis queue (6 min/video × 50 candidates = 5 hours)
**Solution:** Analysis runs in background - doesn't block interviews

---

**Cost Analysis:**
- **Bandwidth:** ~10-20GB/month for 100 interviews = $0.02-0.05/month (AWS S3 pricing)
- **Storage:** ~5GB/month for 50 interviews = $0.11/month (Supabase free tier: 1GB, then $0.021/GB)
- **Total:** **~$0.15/month** for 100 coding interviews

---

### Option 2: **Jitsi Meet** (Open-Source Alternative to Daily.co)

**What it is:**
- Open-source video conferencing platform
- Self-hosted or use free tier (jitsi.org/meet)
- Similar to Daily.co but fully open-source

**Pros:**
- ✅ **100% Open-Source** (Apache 2.0 license)
- ✅ **Self-hostable** - full control over infrastructure
- ✅ **Recording built-in** via Jibri component
- ✅ **Screen sharing** included
- ✅ **No API limits** on self-hosted version

**Cons:**
- ⚠️ **Complex setup** - requires Docker, Prosody, Nginx, Jibri
- ⚠️ **Server costs** - need VPS for self-hosting ($5-20/month)
- ⚠️ **Not designed for proctoring** - built for meetings, not monitoring
- ⚠️ **Overkill** - too many features for simple recording

**When to use:** If you need live interviewer + candidate video calls (you already have Daily.co for this)

---

### Option 3: **RecordRTC** (WebRTC Recording Library)

**What it is:**
- JavaScript library for recording audio/video/screen
- Built on top of MediaRecorder API
- Provides helper functions and cross-browser compatibility

**Pros:**
- ✅ **Free & Open-Source** (MIT License)
- ✅ **Simplifies MediaRecorder** with better browser support
- ✅ **Supports WebM, GIF, WAV** formats
- ✅ **Canvas recording** for screenshots
- ✅ **Active maintenance** (60k+ stars on GitHub)

**Cons:**
- ⚠️ **Just a wrapper** - doesn't add new capabilities beyond MediaRecorder
- ⚠️ **Adds 50KB** to bundle size

**When to use:** If you encounter browser compatibility issues with raw MediaRecorder API

---

### Option 4: **OpenVidu** (WebRTC Platform)

**What it is:**
- Open-source platform for video apps
- Built on Kurento Media Server
- Provides recording, streaming, and layout composition

**Pros:**
- ✅ **Open-source** (Apache 2.0)
- ✅ **Recording infrastructure** built-in
- ✅ **Layout composition** (can record multiple streams in one video)
- ✅ **Commercial support** available (OpenVidu PRO)

**Cons:**
- ⚠️ **Complex architecture** - requires Kurento Media Server, Coturn, Redis
- ⚠️ **Server requirements** - 4GB RAM minimum
- ⚠️ **Overkill** - designed for multi-party conferencing
- ⚠️ **Learning curve** - steep for simple recording

**When to use:** If you need multi-party panel interviews with complex layouts

---

### Option 5: **TensorFlow.js Face Detection** (AI Analysis)

**What it is:**
- JavaScript library for face detection in browser
- Runs face detection models client-side
- Can detect:
  - Face presence (is person looking at screen?)
  - Multiple faces (cheating detection)
  - Face landmarks (eye gaze direction)

**Pros:**
- ✅ **Free & Open-Source** (Apache 2.0)
- ✅ **Client-side** - no server GPU needed
- ✅ **Real-time** - can detect cheating live
- ✅ **Privacy-friendly** - no video sent to servers
- ✅ **Lightweight models** - BlazeFace (400KB)

**Cons:**
- ⚠️ **CPU intensive** - may slow down candidate's browser
- ⚠️ **Not 100% accurate** - false positives possible
- ⚠️ **Client-side** - can be bypassed by tech-savvy candidates

**Technical Implementation:**
```javascript
import * as blazeface from '@tensorflow-models/blazeface'

const model = await blazeface.load()
const predictions = await model.estimateFaces(videoElement)

if (predictions.length === 0) {
  logActivity('face_not_detected')
} else if (predictions.length > 1) {
  logActivity('multiple_faces_detected')
}
```

**When to use:** Combined with video recording for enhanced anti-cheating

---

## RECOMMENDED SOLUTION 🏆

### **Hybrid Approach: MediaRecorder API + TensorFlow.js Face Detection**

**Why this combination:**
1. **MediaRecorder API** for video/screen recording (free, built-in)
2. **TensorFlow.js** for real-time face detection (optional, enhances security)
3. **Existing anti-cheating** system for comprehensive tracking
4. **Supabase Storage** for video storage (already set up)

**Cost Breakdown:**
- **Development:** ~5-7 days (1 week)
- **Monthly Costs:** ~$0.15-0.50 for 100 interviews
- **Storage:** Supabase free tier (1GB) → upgrade to $25/month (100GB) when scaling
- **Bandwidth:** Minimal with chunk uploads

**What you get:**
- ✅ Webcam recording of candidate's face
- ✅ Screen recording of coding activity
- ✅ Dual-stream upload to Supabase Storage
- ✅ Real-time face detection (optional)
- ✅ Risk scoring integration
- ✅ Post-interview playback for reviewers
- ✅ 100% control over infrastructure

---

## Implementation Plan

### Phase 1: Video Recording Infrastructure (3-4 days)

#### **Step 1: Pre-Flight Permission Check (Setup Page)** ⭐

**Goal:** Verify camera and screen permissions BEFORE starting the interview (like voice interview microphone setup)

**New Files:**

**1. Setup Page** (`frontend/src/app/interview/[token]/camera-setup/page.tsx`)
```typescript
export default function CameraSetupPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [step, setStep] = useState<'idle' | 'requesting-camera' | 'testing-camera' | 'requesting-screen' | 'ready' | 'error'>('idle')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Detect mobile device
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    setIsMobile(mobile)
  }, [])

  const handleStartSetup = async () => {
    try {
      // Step 1: Request camera permission
      setStep('requesting-camera')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      })

      setCameraStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      setStep('testing-camera')

      // Wait 2 seconds to show camera preview
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Step 2: Request screen permission (desktop only)
      if (!isMobile) {
        setStep('requesting-screen')
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' }
        })

        setScreenStream(displayStream)

        // Stop screen stream immediately (just checking permission)
        displayStream.getTracks().forEach(track => track.stop())
      }

      // All permissions granted!
      setStep('ready')

      // Store setup completion in sessionStorage
      sessionStorage.setItem(`interview_setup_${token}`, 'completed')

    } catch (err: any) {
      setError(classifyPermissionError(err))
      setStep('error')
    }
  }

  const handleContinue = () => {
    // Stop preview stream
    cameraStream?.getTracks().forEach(track => track.stop())

    // Redirect to interview
    router.push(`/interview/${token}`)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-4">Camera & Screen Check</h1>

        {step === 'idle' && (
          <div className="space-y-4">
            <p className="text-slate-600">
              Before starting your interview, we need to verify your camera
              {!isMobile && ' and screen sharing'} permissions.
            </p>

            {isMobile && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  📱 Mobile device detected. Screen recording is not available on mobile browsers.
                  Only your front camera will be recorded.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">We will check:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
                <li>Front camera access</li>
                {!isMobile && <li>Screen sharing permission</li>}
                <li>Camera video quality</li>
              </ul>
            </div>

            <Button onClick={handleStartSetup} className="w-full">
              Start Permission Check
            </Button>
          </div>
        )}

        {step === 'requesting-camera' && (
          <div className="text-center py-8">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-indigo-600 mb-4" />
            <p>Requesting camera permission...</p>
            <p className="text-sm text-slate-500 mt-2">
              Click "Allow" when your browser asks for camera access
            </p>
          </div>
        )}

        {step === 'testing-camera' && (
          <div className="space-y-4">
            <p className="text-green-600 font-medium">✓ Camera access granted!</p>

            {/* Camera preview */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                Camera Preview
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Can you see yourself clearly? If yes, we'll continue to the next step.
            </p>
          </div>
        )}

        {step === 'requesting-screen' && (
          <div className="text-center py-8">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-indigo-600 mb-4" />
            <p>Requesting screen sharing permission...</p>
            <p className="text-sm text-slate-500 mt-2">
              Select "Entire Screen" or "Browser Tab" and click "Share"
            </p>
          </div>
        )}

        {step === 'ready' && (
          <div className="space-y-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-green-600">All Set!</h2>
            <p className="text-slate-600">
              Camera{!isMobile && ' and screen sharing'} permissions verified.
              You can now start your interview.
            </p>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-left">
              <h3 className="font-semibold text-sm mb-2">What will be recorded:</h3>
              <ul className="text-sm text-slate-700 space-y-1">
                <li>✓ Your front camera (shown in top-right corner)</li>
                {!isMobile && <li>✓ Your screen activity</li>}
                <li>✓ Your coding activity and answers</li>
              </ul>
            </div>

            <Button onClick={handleContinue} className="w-full">
              Continue to Interview
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium mb-2">Permission Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>

            <BrowserPermissionGuide errorType={error} />

            <Button onClick={handleStartSetup} variant="outline" className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

**2. Permission Error Classifier** (`frontend/src/lib/utils/cameraPermissions.ts`)
```typescript
export function classifyPermissionError(error: Error): string {
  if (error.name === 'NotAllowedError') {
    return 'Camera/screen permission denied. Please click "Allow" when asked.'
  }
  if (error.name === 'NotFoundError') {
    return 'No camera detected. Please connect a webcam to continue.'
  }
  if (error.name === 'NotReadableError') {
    return 'Camera is being used by another application. Please close other apps using your camera.'
  }
  if (error.name === 'AbortError') {
    return 'Screen sharing cancelled. Please select a screen/window to share.'
  }
  if (error.name === 'NotSupportedError') {
    return 'Your browser does not support camera/screen recording. Please use Chrome, Firefox, or Edge.'
  }
  return 'Unknown error. Please try again or use a different browser.'
}
```

**3. Modify Interview Page** - Add redirect to setup
```typescript
// frontend/src/app/interview/[token]/page.tsx

useEffect(() => {
  // Check if camera setup was completed
  const setupCompleted = sessionStorage.getItem(`interview_setup_${token}`)

  if (!setupCompleted && interview?.require_video_proctoring) {
    // Redirect to setup page first
    router.push(`/interview/${token}/camera-setup`)
  }
}, [token, interview])
```

---

#### **Step 2: Backend Changes**

**1. Database Migration** (`backend/migrations/037_coding_video_proctoring.sql`)
```sql
-- New table for video recordings
CREATE TABLE video_proctoring_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES coding_submissions(id) ON DELETE CASCADE,

  -- Webcam recording
  webcam_storage_path TEXT,
  webcam_duration_seconds INTEGER,
  webcam_size_bytes BIGINT,
  webcam_upload_status TEXT CHECK (webcam_upload_status IN ('pending', 'uploading', 'completed', 'failed')),
  webcam_uploaded_at TIMESTAMPTZ,

  -- Screen recording
  screen_storage_path TEXT,
  screen_duration_seconds INTEGER,
  screen_size_bytes BIGINT,
  screen_upload_status TEXT CHECK (screen_upload_status IN ('pending', 'uploading', 'completed', 'failed')),
  screen_uploaded_at TIMESTAMPTZ,

  -- Face detection events
  face_detection_enabled BOOLEAN DEFAULT FALSE,
  face_absence_events JSONB DEFAULT '[]'::jsonb,  -- [{timestamp, duration_seconds}]
  multiple_faces_events JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  browser_info TEXT,
  recording_started_at TIMESTAMPTZ,
  recording_ended_at TIMESTAMPTZ,
  org_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_video_proctoring_submission ON video_proctoring_sessions(submission_id);
CREATE INDEX idx_video_proctoring_org ON video_proctoring_sessions(org_id);

-- Add video session reference to submissions
ALTER TABLE coding_submissions
  ADD COLUMN video_session_id UUID REFERENCES video_proctoring_sessions(id);
```

**2. New Service** (`backend/app/services/video_proctoring_service.py`)
```python
class VideoProctoringService:
    def create_session(self, submission_id: str, org_id: str) -> dict:
        """Initialize video proctoring session."""

    def upload_webcam_chunk(self, session_id: str, chunk: bytes, sequence: int):
        """Upload webcam video chunk to Supabase Storage."""
        # Path: coding-videos/{submission_id}/webcam/{sequence}.webm

    def upload_screen_chunk(self, session_id: str, chunk: bytes, sequence: int):
        """Upload screen recording chunk to Supabase Storage."""
        # Path: coding-videos/{submission_id}/screen/{sequence}.webm

    def finalize_session(self, session_id: str, metadata: dict):
        """Mark session complete and merge chunks into single video."""
        # 1. Get all chunk paths from Supabase Storage
        # 2. Download chunks to temporary directory
        # 3. Use FFmpeg to concatenate chunks:
        #    ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.webm
        # 4. Upload merged video to Supabase Storage
        # 5. Delete individual chunk files
        # 6. Update upload_status to 'completed'
        # 7. Return final video paths

    def log_face_event(self, session_id: str, event_type: str, timestamp: datetime):
        """Log face detection events."""
        # Append to face_absence_events or multiple_faces_events

    def get_signed_urls(self, session_id: str) -> dict:
        """Get signed URLs for playback."""
        return {
            'webcam_url': storage.get_signed_url(webcam_path, expires_in=3600),
            'screen_url': storage.get_signed_url(screen_path, expires_in=3600)
        }
```

**3. New API Endpoints** (`backend/app/api/v1/coding_interviews.py`)
```python
@router.post("/submissions/{submission_id}/video-session")
async def create_video_session(
    submission_id: str,
    ctx: OrgContext = Depends(get_current_org_context)
):
    """Initialize video proctoring for a coding interview."""
    service = get_video_proctoring_service()
    return service.create_session(submission_id, ctx.org_id)

@router.post("/video-sessions/{session_id}/upload-webcam-chunk")
async def upload_webcam_chunk(
    session_id: str,
    sequence: int,
    file: UploadFile = File(...),
):
    """Upload webcam video chunk."""
    chunk = await file.read()
    service = get_video_proctoring_service()
    return service.upload_webcam_chunk(session_id, chunk, sequence)

@router.post("/video-sessions/{session_id}/upload-screen-chunk")
async def upload_screen_chunk(
    session_id: str,
    sequence: int,
    file: UploadFile = File(...),
):
    """Upload screen recording chunk."""
    chunk = await file.read()
    service = get_video_proctoring_service()
    return service.upload_screen_chunk(session_id, chunk, sequence)

@router.post("/video-sessions/{session_id}/finalize")
async def finalize_video_session(
    session_id: str,
    metadata: dict,
    ctx: OrgContext = Depends(get_current_org_context)
):
    """Finalize video session and merge chunks."""
    service = get_video_proctoring_service()
    return service.finalize_session(session_id, metadata)

@router.post("/video-sessions/{session_id}/face-event")
async def log_face_event(
    session_id: str,
    event_type: str,  # 'face_absent', 'multiple_faces'
    timestamp: datetime
):
    """Log face detection event."""
    service = get_video_proctoring_service()
    return service.log_face_event(session_id, event_type, timestamp)

@router.get("/submissions/{submission_id}/video-playback")
async def get_video_playback_urls(
    submission_id: str,
    ctx: OrgContext = Depends(require_permission('interview:evaluate'))
):
    """Get signed URLs for video playback (reviewers only)."""
    # Get video_session_id from submission
    # Return signed URLs for webcam and screen recordings
```

#### **Frontend Changes**

**1. New Hook** (`frontend/src/hooks/useVideoProctoring.ts`)
```typescript
export function useVideoProctoring(submissionId: string) {
  const [webcamRecorder, setWebcamRecorder] = useState<MediaRecorder | null>(null)
  const [screenRecorder, setScreenRecorder] = useState<MediaRecorder | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ webcam: 0, screen: 0 })

  // Initialize recording
  const startRecording = async () => {
    // 1. Create video session
    const session = await apiClient.createVideoSession(submissionId)
    setSessionId(session.id)

    // 2. Request webcam permission
    const webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 15 },
      audio: false
    })

    // 3. Request screen recording permission
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 5 }
    })

    // 4. Create recorders with chunk upload
    const webcamRec = new MediaRecorder(webcamStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 300000
    })

    let webcamSequence = 0
    webcamRec.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        await uploadWebcamChunk(session.id, event.data, webcamSequence++)
      }
    }

    // Similar for screen recorder

    // 5. Start recording with 30-second chunks
    webcamRec.start(30000)  // 30 seconds
    screenRec.start(30000)

    setWebcamRecorder(webcamRec)
    setScreenRecorder(screenRec)
    setIsRecording(true)
  }

  // Stop recording
  const stopRecording = async () => {
    webcamRecorder?.stop()
    screenRecorder?.stop()

    // Finalize session
    if (sessionId) {
      await apiClient.finalizeVideoSession(sessionId, {
        webcam_duration: webcamRecorder.duration,
        screen_duration: screenRecorder.duration
      })
    }

    setIsRecording(false)
  }

  return { startRecording, stopRecording, isRecording, uploadProgress }
}
```

**2. Modify Interview Page** (`frontend/src/app/interview/[token]/page.tsx`)

Add video recording initialization:
```typescript
const videoProctoring = useVideoProctoring(submissionId)

const handleStartSubmission = async () => {
  // ... existing validation ...

  // START VIDEO PROCTORING
  try {
    await videoProctoring.startRecording()
    toast.success('Video proctoring started')
  } catch (err) {
    // If user denies camera/screen, show warning but allow interview
    toast.warning('Camera/screen access denied. Interview will continue without video.')
    logActivity('video_proctoring_denied', { error: err.message })
  }

  // Initialize anti-cheating (already done)
  antiCheatingRef.current = await initializeEnhancedAntiCheating(...)
}

// On submit - stop recording
const confirmSubmit = async () => {
  // ... existing submission logic ...

  // STOP VIDEO PROCTORING
  if (videoProctoring.isRecording) {
    await videoProctoring.stopRecording()
  }

  // Submit interview
  await submitInterview(submissionId, ...)
}

// On timer expiration - auto-stop recording
useEffect(() => {
  if (timeRemaining <= 0 && videoProctoring.isRecording) {
    videoProctoring.stopRecording()
  }
}, [timeRemaining])
```

**3. Self-View Video (Candidate's Face in Corner)** ⭐

Like Google Meet, show the candidate their own face in a small video box:

```tsx
{/* Self-view webcam in top-right corner */}
{videoProctoring.isRecording && videoProctoring.webcamStream && (
  <div className="fixed top-20 right-4 w-48 h-36 rounded-lg overflow-hidden border-2 border-indigo-500 shadow-xl bg-black z-50">
    {/* Video element showing webcam stream */}
    <video
      ref={selfViewRef}
      autoPlay
      playsInline
      muted  // Mute self-view to avoid echo
      className="w-full h-full object-cover"
    />

    {/* Recording indicator overlay */}
    <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
      <span>REC</span>
    </div>

    {/* Face detection status */}
    {enableFaceDetection && !faceDetection.faceDetected && (
      <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/20 backdrop-blur-sm">
        <span className="text-yellow-200 text-xs font-medium">
          ⚠️ Face not detected
        </span>
      </div>
    )}
  </div>
)}
```

**Hook Update** (`useVideoProctoring.ts`):
```typescript
export function useVideoProctoring(submissionId: string) {
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null)
  const selfViewRef = useRef<HTMLVideoElement>(null)

  const startRecording = async () => {
    // ... existing code ...

    // Request webcam
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 15 },
      audio: false
    })

    // Store stream for self-view
    setWebcamStream(stream)

    // Attach stream to self-view video element
    if (selfViewRef.current) {
      selfViewRef.current.srcObject = stream
    }

    // ... rest of recording code ...
  }

  return {
    ...
    webcamStream,
    selfViewRef,
  }
}
```

**4. Video Upload Indicator UI**
```tsx
{videoProctoring.isRecording && (
  <div className="fixed bottom-4 right-4 bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
    <span className="text-sm font-medium">Recording</span>
    <span className="text-xs opacity-75">
      Webcam: {videoProctoring.uploadProgress.webcam}%
    </span>
  </div>
)}
```

---

### Phase 2: Face Detection (Optional Enhancement) (2-3 days)

**1. Install TensorFlow.js**
```bash
npm install @tensorflow/tfjs @tensorflow-models/blazeface
```

**2. New Hook** (`frontend/src/hooks/useFaceDetection.ts`)
```typescript
import * as blazeface from '@tensorflow-models/blazeface'

export function useFaceDetection(videoElement: HTMLVideoElement, sessionId: string) {
  const [model, setModel] = useState(null)
  const [faceDetected, setFaceDetected] = useState(true)
  const [multipleFaces, setMultipleFaces] = useState(false)

  useEffect(() => {
    loadModel()
  }, [])

  const loadModel = async () => {
    const loadedModel = await blazeface.load()
    setModel(loadedModel)
    startDetection()
  }

  const startDetection = () => {
    setInterval(async () => {
      if (!model || !videoElement) return

      const predictions = await model.estimateFaces(videoElement)

      // Face absent
      if (predictions.length === 0) {
        setFaceDetected(false)
        apiClient.logFaceEvent(sessionId, 'face_absent', new Date())
      } else {
        setFaceDetected(true)
      }

      // Multiple faces
      if (predictions.length > 1) {
        setMultipleFaces(true)
        apiClient.logFaceEvent(sessionId, 'multiple_faces', new Date())
      } else {
        setMultipleFaces(false)
      }
    }, 3000)  // Check every 3 seconds
  }

  return { faceDetected, multipleFaces }
}
```

**3. Warning UI**
```tsx
{!faceDetection.faceDetected && (
  <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg">
    ⚠️ Face not detected. Please look at the screen.
  </div>
)}

{faceDetection.multipleFaces && (
  <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
    🚨 Multiple faces detected. Ensure you are alone.
  </div>
)}
```

---

### Phase 3: Voice Interview Video Recording (2-3 days)

**Goal:** Add webcam recording to voice interviews (remove misleading "screen capture" notice)

**Changes:**

1. **Remove Misleading Notice** (`frontend/src/app/voice-interview/[token]/page.tsx` line 442)
   ```tsx
   // DELETE THIS:
   {/* <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
     <p className="text-yellow-200 font-medium">
       Your screen is continuously captured...
     </p>
   </div> */}

   // REPLACE WITH:
   {videoRecording.isRecording && (
     <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
       <div className="flex items-center gap-2 text-red-200">
         <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
         <span className="font-medium">Video Recording Active</span>
       </div>
     </div>
   )}
   ```

2. **Add Video Recording Hook**
   ```typescript
   const videoRecording = useVideoProctoring(candidate.id)

   // Start recording when call starts
   vapi.on('call-start', async () => {
     setCallState('active')
     await videoRecording.startRecording()
   })

   // Stop recording when call ends
   vapi.on('call-end', async () => {
     await videoRecording.stopRecording()
     setCallState('ended')
   })
   ```

3. **Backend Schema** (extend voice_call_history)
   ```sql
   ALTER TABLE voice_call_history
     ADD COLUMN video_storage_path TEXT,
     ADD COLUMN video_duration_seconds INTEGER,
     ADD COLUMN video_upload_status TEXT DEFAULT 'pending';
   ```

---

## 📦 Complete Package Dependencies

### Frontend (NPM Packages)

**New Packages to Install:**
```bash
# TensorFlow.js for face detection
npm install @tensorflow/tfjs @tensorflow-models/blazeface

# Types
npm install --save-dev @types/dom-mediacapture-record
```

**Package Details:**

| Package | Version | Size | Purpose | License |
|---------|---------|------|---------|---------|
| **@tensorflow/tfjs** | ^4.14.0 | ~200KB | TensorFlow.js core library | Apache 2.0 |
| **@tensorflow-models/blazeface** | ^0.0.7 | ~400KB | Lightweight face detection model | Apache 2.0 |
| **@types/dom-mediacapture-record** | ^1.0.16 | Dev only | TypeScript types for MediaRecorder | MIT |

**Built-in Browser APIs (No Install Required):**
- `navigator.mediaDevices.getUserMedia` - Webcam access
- `navigator.mediaDevices.getDisplayMedia` - Screen sharing
- `MediaRecorder` - Video/audio recording
- `Blob` - Binary data handling
- `FormData` - File uploads

**Existing Packages (Already Installed):**
- `react` - UI framework
- `next` - App framework
- `@tanstack/react-query` - Data fetching
- `axios` or `fetch` - HTTP requests

### Backend (Python Packages)

**New Packages to Install:**
```bash
# Add to backend/requirements.txt

# Video processing
opencv-python==4.8.1.78

# Already installed (no changes needed)
# fastapi
# uvicorn
# supabase
# pydantic
```

**Package Details:**

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| **opencv-python** | 4.8.1.78 | Video frame extraction for Ollama analysis | Apache 2.0 |
| **fastapi** | 0.115+ | Already installed - API framework | MIT |
| **supabase** | Latest | Already installed - Storage client | MIT |
| **pydantic** | v2 | Already installed - Data validation | MIT |

**Ollama Models (Already Installed):**
- `llava:7b` - Vision model for video analysis (you already have this)
- `qwen2.5:7b` - Text model for summary generation (you already have this)

### System Requirements

**Browser Compatibility:**

| Feature | Desktop | Mobile |
|---------|---------|--------|
| **Webcam Recording** | ✅ Chrome 53+, Firefox 36+, Safari 14.1+, Edge 79+ | ✅ iOS Safari 14.3+, Android Chrome 53+ |
| **Screen Recording** | ✅ All modern browsers | ❌ **NOT SUPPORTED** on iOS/Android |
| **TensorFlow.js Face Detection** | ✅ All modern browsers | ✅ Works but slower (drains battery) |
| **MediaRecorder API** | ✅ Full support | ⚠️ Partial support (no screen) |

**Mobile Limitations:**
- ❌ Screen recording NOT available on iOS/Android (browser security restriction)
- ⚠️ Front camera only (no rear camera switch during interview)
- ⚠️ TensorFlow.js face detection slower on mobile (may drain battery)
- ⚠️ Higher data usage for video upload on cellular networks

**Solution:** Detect device type and adapt recording strategy:
```typescript
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

if (isMobile) {
  // Mobile: Record front camera only, skip screen
  recordingStrategy = 'webcam-only'
  showWarning('Screen recording not available on mobile')
} else {
  // Desktop: Record webcam + screen
  recordingStrategy = 'webcam-and-screen'
}
```

**Minimum Browser Features Required:**
- MediaRecorder API (webcam recording)
- getUserMedia (webcam access)
- getDisplayMedia (screen share - **desktop only**)
- WebRTC
- Canvas API
- WebAssembly (for TensorFlow.js)

**Server Requirements:**
- Python 3.9+
- Ollama installed and running
- **FFmpeg** - **REQUIRED** for:
  - Merging video chunks into single file (Phase 1)
  - Extracting frames for Ollama analysis (Phase 3)

**FFmpeg Installation (MUST INSTALL):**
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
# Or use: winget install ffmpeg

# Verify installation
ffmpeg -version  # Should show FFmpeg version
```

**Python FFmpeg Wrapper (Already Installed):**
- `opencv-python` uses FFmpeg under the hood
- No additional Python package needed for FFmpeg
- Just ensure FFmpeg binary is in system PATH

### Storage Requirements

**Per Coding Interview (1 hour):**
- Webcam recording: ~150-250 MB (640x480 @ 15fps, VP9 codec)
- Screen recording: ~250-400 MB (1920x1080 @ 5fps, VP9 codec)
- **Total:** ~400-650 MB per interview

**Monthly Storage (100 interviews):**
- ~40-65 GB/month
- Supabase Storage pricing: $0.021/GB/month
- **Cost:** ~$0.84-1.37/month

**Optimization Options:**
- Lower webcam resolution to 480x360 (saves 30%)
- Lower screen framerate to 3fps (saves 40%)
- Use VP9 codec (better compression than H.264)

---

## Critical Files Summary (CODING INTERVIEWS ONLY)

### New Files to Create
- `backend/migrations/037_coding_video_proctoring.sql` - Video proctoring tables
- `backend/migrations/038_video_analysis_reports.sql` - Ollama analysis columns
- `backend/migrations/039_interview_video_config.sql` - Interview configuration
- `backend/app/services/video_proctoring_service.py` - Video upload/storage service
- `backend/app/services/video_analysis_service.py` - Ollama post-interview analysis
- `backend/app/workers/video_analysis_worker.py` - Background analysis queue
- `frontend/src/app/interview/[token]/camera-setup/page.tsx` - Pre-flight permission check
- `frontend/src/lib/utils/cameraPermissions.ts` - Permission error classifier
- `frontend/src/hooks/useVideoProctoring.ts` - Video recording hook
- `frontend/src/hooks/useFaceDetection.ts` - TensorFlow.js face detection hook

### Files to Modify
- `backend/app/api/v1/coding_interviews.py` - Add video session + upload endpoints
- `backend/app/main.py` - Add video analysis worker startup
- `frontend/src/app/interview/[token]/page.tsx` - Add setup redirect + recording integration
- `frontend/src/app/dashboard/coding-interviews/create/page.tsx` - Add video config toggles

### Files NOT Modified (Deferred)
- ❌ `frontend/src/app/voice-interview/[token]/page.tsx` - Voice interview (not in scope)
- ❌ `backend/migrations/XXX_voice_video.sql` - Voice schema (not in scope)

---

## Cost Analysis (100 Interviews/Month)

| Component | Cost | Notes |
|-----------|------|-------|
| **MediaRecorder API** | $0.00 | Built into browsers |
| **TensorFlow.js** | $0.00 | Open-source library |
| **Supabase Storage (5GB)** | $0.11 | $0.021/GB after 1GB free tier |
| **Bandwidth (10GB)** | $0.02 | Egress for playback |
| **Development Time** | 1 week | Initial implementation |
| **TOTAL** | **~$0.15/month** | Scales to $25/month at 500 interviews (100GB storage) |

**Comparison to Paid Solutions:**
- **Proctorio:** $5-10 per test
- **ProctorU:** $25-40 per test
- **Honorlock:** $10-20 per test

**Savings:** **95-99%** cost reduction

---

## Testing & Verification (CODING INTERVIEWS)

### Pre-Flight Permission Setup Tests
1. **Desktop:** Camera → Screen → Both granted → Continue to interview
2. **Desktop:** Camera denied → Error shown → Browser-specific help displayed
3. **Desktop:** Screen denied → Error shown → Retry option available
4. **Mobile:** Camera requested → Screen skip → Mobile warning shown
5. **Setup completion:** sessionStorage stores completion → Redirect works

### Video Recording Tests
6. **Desktop recording:** Webcam + screen both recording → Self-view visible → Chunks upload every 30s
7. **Mobile recording:** Webcam-only recording → Screen recording skipped → Self-view visible
8. **Self-view:** Video shows candidate's face → Recording indicator visible → Updates when stopped
9. **Upload progress:** Progress indicator shows webcam/screen upload status
10. **Interview submit:** Recording stops → Final chunks uploaded → Session finalized

### Face Detection Tests (Phase 2)
11. **Face present:** No warning shown → Events not logged
12. **Face absent >5s:** Warning overlay shown → Event logged to backend
13. **Multiple faces:** Warning shown → Event logged with timestamp
14. **Mobile face detection:** Works but slower → Battery impact acceptable

### Ollama Analysis Tests (Phase 3)
15. **Post-submission:** Video queued for analysis → Status "pending"
16. **Background worker:** Picks up pending videos → Status "processing"
17. **Frame extraction:** Frames extracted every 10 seconds → Passed to llava:7b
18. **Analysis results:** Attention score calculated → Risk level assigned → Suspicious moments flagged
19. **Reviewer UI:** Analysis visible on submission page → Clickable timestamps

### Configuration Tests
20. **Interview creation:** Toggles for video proctoring, screen recording, face detection
21. **Required video:** Interview blocks without setup completion
22. **Optional video:** Interview allows continuation without video

### Not Tested (Deferred)
- ❌ Voice interview video recording

---

## Security Considerations

### Strengths
- ✅ **Multi-layered detection:** Video + anti-cheating + activity logging
- ✅ **Tamper-evident:** If candidate disables camera/screen, it's logged
- ✅ **Privacy-compliant:** Recordings stored securely with signed URLs
- ✅ **Audit trail:** All events timestamped and logged

### Limitations
- ⚠️ **Client-side recording** - tech-savvy candidates could potentially bypass
- ⚠️ **Browser compatibility** - requires modern browsers with MediaRecorder support
- ⚠️ **Storage costs** - scales with interview volume
- ⚠️ **Not 100% foolproof** - no proctoring system is perfect

### Mitigation Strategies
- Use risk scoring to flag suspicious activity
- Combine video evidence with anti-cheating metrics
- Manual review of high-risk submissions
- Clear policy: "Recording required, interviews without video are invalid"

---

## Recommended Action Plan (CODING INTERVIEWS ONLY)

### Week 1-2: Phase 1 (Setup Page + Video Recording)
- **Week 1:**
  - Day 1-2: Backend migrations (036, 038)
  - Day 2-3: Video proctoring service + API endpoints
  - Day 3-4: Permission setup page with mobile detection
  - Day 5: Testing setup page across browsers
- **Week 2:**
  - Day 1-2: Video recording hooks (useVideoProctoring)
  - Day 2-3: Self-view component + recording UI
  - Day 3-4: Interview page integration
  - Day 5: End-to-end testing

### Week 3: Phase 2 (Real-Time Face Detection)
- Day 1: Install TensorFlow.js + create useFaceDetection hook
- Day 2: Integrate with self-view + warning overlays
- Day 3: Testing + performance tuning

### Week 4: Phase 3 (Ollama Post-Interview Analysis)
- Day 1-2: Install opencv-python + VideoAnalysisService
- Day 2-3: Background worker + analysis queue
- Day 3-4: Reviewer UI for analysis results
- Day 5: Full system testing + deployment

### Not Included (Deferred to Later):
- ❌ Voice interview video recording
- ❌ Live proctoring with human reviewers
- ❌ Advanced gaze tracking or emotion detection

---

## ✅ FINAL IMPLEMENTATION DECISIONS

Based on your requirements:

1. **Recording Scope:** ✅ Webcam + Screen (desktop), Webcam-only (mobile)
2. **Face Detection:** ✅ TensorFlow.js (real-time) + Ollama (post-analysis)
3. **Upload Strategy:** ✅ Chunked upload during interview (30-second chunks)
4. **Enforcement:** ✅ Configurable per interview (interviewer chooses when creating)
5. **Pre-flight Checks:** ✅ Setup page before interview starts (like voice interview mic setup)
6. **Self-View:** ✅ Show candidate their face in top-right corner (like Google Meet)
7. **Voice Interviews:** ⏸️ **DEFERRED** - Will implement in separate phase after coding interviews

---

## Implementation Phases (FINALIZED - CODING INTERVIEWS ONLY)

### Phase 1: Pre-Flight Setup + Video Recording Infrastructure (Week 1-2)

**Scope:**
- Pre-flight permission check page (`/interview/[token]/camera-setup`)
- Mobile device detection with adaptive recording strategy
- Webcam + screen recording for coding interviews (desktop)
- Webcam-only recording for mobile devices
- Self-view video in top-right corner with recording indicator
- Chunked upload to Supabase Storage (30-second intervals)
- Configurable per-interview video requirements

**Week 1: Backend + Database + Setup Page**
- Day 1-2: Migration 037 (video_proctoring_sessions table)
- Day 2-3: Migration 039 (interview configuration columns)
- Day 3-4: Video proctoring service + API endpoints
- Day 4-5: Permission setup page with mobile detection

**Week 2: Interview Page Integration**
- Day 1-2: Video recording hooks (useVideoProctoring)
- Day 2-3: Self-view component + recording indicators
- Day 3-4: Interview page redirect to setup + recording integration
- Day 5: Testing across browsers and devices

---

### Phase 2: Real-Time Face Detection (Week 3)

**Scope:**
- TensorFlow.js BlazeFace integration
- Real-time face absence/multiple faces detection
- Live warning overlays
- Event logging to backend

**Implementation:**
- Day 1: Install packages + create useFaceDetection hook
- Day 2: Integrate with self-view video + warning UI
- Day 3: Testing + performance optimization

---

### Phase 3: Ollama Post-Interview Analysis (Week 4)

**Goal:** Use Ollama's vision model (llava:7b) to analyze recorded videos after interview completion and generate AI-powered reports.

**New Service:** `backend/app/services/video_analysis_service.py`

```python
from app.services.llm_orchestrator import generate_completion
import cv2  # OpenCV for video frame extraction
import base64

class VideoAnalysisService:
    def analyze_interview_video(self, video_path: str) -> dict:
        """
        Analyze recorded interview video using Ollama vision model.

        Returns:
        {
            'summary': 'Candidate maintained good focus...',
            'suspicious_moments': [
                {'timestamp': '00:05:30', 'description': 'Looked away for 15 seconds'},
                {'timestamp': '00:12:45', 'description': 'Multiple faces detected'}
            ],
            'attention_score': 85,  # 0-100
            'risk_level': 'low'  # low, medium, high
        }
        """
        # 1. Extract frames from video (1 frame every 10 seconds)
        frames = self._extract_frames(video_path, interval=10)

        # 2. Analyze each frame with Ollama
        analysis_results = []
        for timestamp, frame_base64 in frames:
            result = self._analyze_frame(frame_base64, timestamp)
            analysis_results.append(result)

        # 3. Generate summary report
        report = self._generate_report(analysis_results)
        return report

    def _extract_frames(self, video_path: str, interval: int = 10):
        """Extract frames from video at specified interval (seconds)."""
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(fps * interval)

        frames = []
        frame_count = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % frame_interval == 0:
                # Convert frame to base64
                _, buffer = cv2.imencode('.jpg', frame)
                frame_base64 = base64.b64encode(buffer).decode('utf-8')

                timestamp_seconds = frame_count / fps
                timestamp = self._format_timestamp(timestamp_seconds)

                frames.append((timestamp, frame_base64))

            frame_count += 1

        cap.release()
        return frames

    def _analyze_frame(self, frame_base64: str, timestamp: str) -> dict:
        """Analyze single frame using Ollama vision model."""
        prompt = f"""Analyze this image from a coding interview at timestamp {timestamp}.

        Look for:
        1. Number of people visible (should be exactly 1)
        2. Is the candidate looking at the screen?
        3. Are they using a phone or second device?
        4. Any suspicious behavior?

        Respond with JSON:
        {{
            "people_count": 1,
            "looking_at_screen": true,
            "suspicious_activity": false,
            "description": "Candidate focused on screen"
        }}
        """

        # Use Ollama vision model
        response = generate_completion(
            prompt=prompt,
            model="llava:7b",
            temperature=0.3,
            image_base64=frame_base64  # Pass image to vision model
        )

        return {
            'timestamp': timestamp,
            **self._parse_json_response(response)
        }

    def _generate_report(self, analysis_results: list) -> dict:
        """Generate final analysis report from all frame analyses."""
        suspicious_moments = []
        total_frames = len(analysis_results)
        attention_frames = 0

        for result in analysis_results:
            if result.get('people_count', 1) > 1:
                suspicious_moments.append({
                    'timestamp': result['timestamp'],
                    'description': f"{result['people_count']} people detected"
                })

            if not result.get('looking_at_screen', True):
                suspicious_moments.append({
                    'timestamp': result['timestamp'],
                    'description': 'Candidate not looking at screen'
                })

            if result.get('suspicious_activity', False):
                suspicious_moments.append({
                    'timestamp': result['timestamp'],
                    'description': result.get('description', 'Suspicious behavior')
                })

            if result.get('looking_at_screen', True):
                attention_frames += 1

        attention_score = int((attention_frames / total_frames) * 100)

        risk_level = 'low'
        if len(suspicious_moments) > 5:
            risk_level = 'high'
        elif len(suspicious_moments) > 2:
            risk_level = 'medium'

        return {
            'summary': self._generate_summary(attention_score, suspicious_moments),
            'suspicious_moments': suspicious_moments,
            'attention_score': attention_score,
            'risk_level': risk_level,
            'total_frames_analyzed': total_frames
        }

    def _generate_summary(self, attention_score: int, suspicious_moments: list) -> str:
        """Generate human-readable summary."""
        if attention_score >= 85 and len(suspicious_moments) == 0:
            return "Candidate maintained excellent focus throughout the interview with no suspicious activity detected."
        elif attention_score >= 70:
            return f"Candidate showed good attention ({attention_score}% focus rate) with {len(suspicious_moments)} minor anomalies."
        else:
            return f"Multiple concerns detected. Attention score: {attention_score}%. {len(suspicious_moments)} suspicious moments flagged for review."
```

**New Migration:** `backend/migrations/038_video_analysis_reports.sql`
```sql
-- Add analysis results to video sessions
ALTER TABLE video_proctoring_sessions
  ADD COLUMN analysis_status TEXT CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  ADD COLUMN analysis_summary TEXT,
  ADD COLUMN attention_score INTEGER,  -- 0-100
  ADD COLUMN suspicious_moments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  ADD COLUMN analyzed_at TIMESTAMPTZ;

-- Index for pending analysis queue
CREATE INDEX idx_video_analysis_pending ON video_proctoring_sessions(analysis_status)
  WHERE analysis_status = 'pending';
```

**Background Worker:** `backend/app/workers/video_analysis_worker.py`
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

async def process_pending_analyses():
    """Process videos awaiting AI analysis."""
    service = get_video_proctoring_service()
    analysis_service = VideoAnalysisService()

    # Get videos pending analysis
    pending_videos = service.get_pending_analysis()

    for video_session in pending_videos:
        try:
            # Update status to processing
            service.update_analysis_status(video_session['id'], 'processing')

            # Download video from Supabase Storage
            video_path = service.download_video(video_session['webcam_storage_path'])

            # Analyze with Ollama
            analysis = analysis_service.analyze_interview_video(video_path)

            # Save results
            service.save_analysis_results(video_session['id'], analysis)

        except Exception as e:
            logger.error(f"Video analysis failed: {e}")
            service.update_analysis_status(video_session['id'], 'failed')

def start_analysis_worker():
    scheduler = AsyncIOScheduler()
    # Run every 5 minutes
    scheduler.add_job(process_pending_analyses, 'interval', minutes=5)
    scheduler.start()
```

**Add to main.py:**
```python
from app.workers.video_analysis_worker import start_analysis_worker

@app.on_event("startup")
async def startup_event():
    start_analysis_worker()
```

**New Dependencies:**
```txt
opencv-python==4.8.1.78  # Video frame extraction
```

**Reviewer UI Addition:**
```tsx
{/* AI Analysis Report */}
{analysis && (
  <div className="mt-6 p-4 border rounded-lg">
    <h3 className="font-semibold mb-2">AI Video Analysis</h3>
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span>Attention Score:</span>
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${analysis.attention_score >= 80 ? 'bg-green-500' : 'bg-yellow-500'}`}
              style={{ width: `${analysis.attention_score}%` }}
            />
          </div>
          <span className="font-semibold">{analysis.attention_score}%</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span>Risk Level:</span>
        <Badge variant={analysis.risk_level === 'low' ? 'success' : 'warning'}>
          {analysis.risk_level}
        </Badge>
      </div>
      <p className="text-sm text-slate-600 mt-2">{analysis.summary}</p>

      {analysis.suspicious_moments.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Flagged Moments:</h4>
          <ul className="space-y-1 text-sm">
            {analysis.suspicious_moments.map((moment, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red-500 font-mono">{moment.timestamp}</span>
                <span className="text-slate-600">{moment.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
)}
```

**Implementation:**
- Day 1-2: Install opencv-python + create VideoAnalysisService
- Day 2-3: Background worker for processing queue
- Day 3-4: Reviewer UI for analysis results
- Day 4-5: Testing + deployment

---

### Phase 4 (DEFERRED): Voice Interview Video Recording

**Status:** ⏸️ **NOT INCLUDED IN CURRENT IMPLEMENTATION**

This phase will be addressed in a separate implementation after coding interview video proctoring is complete and tested.

**Future Scope:**
- Add webcam recording to voice interviews
- Remove misleading "screen capture" notice from voice interview page
- Reuse video recording infrastructure from coding interviews
- Integration with Vapi call lifecycle
- Optional: Add Ollama analysis for voice interviews

**See Plan Details:** Lines 916-965 in this file contain full implementation details for when this phase is ready.

---

## New Database Migration: Interview Configuration

**Migration 039: Add video recording configuration to interviews**
```sql
-- Add video proctoring settings to coding_interviews
ALTER TABLE coding_interviews
  ADD COLUMN require_video_proctoring BOOLEAN DEFAULT FALSE,
  ADD COLUMN require_screen_recording BOOLEAN DEFAULT FALSE,
  ADD COLUMN enable_face_detection BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN coding_interviews.require_video_proctoring IS
  'If true, interview is invalid without webcam recording';

COMMENT ON COLUMN coding_interviews.require_screen_recording IS
  'If true, interview is invalid without screen share recording';

COMMENT ON COLUMN coding_interviews.enable_face_detection IS
  'Enable TensorFlow.js real-time face detection warnings';
```

**Frontend: Interview Creation Form**
```tsx
<div className="space-y-4 border-t pt-4">
  <h3 className="font-semibold">Video Proctoring Settings</h3>

  <div className="flex items-center justify-between">
    <Label htmlFor="requireVideo">Require Webcam Recording</Label>
    <Switch
      id="requireVideo"
      checked={requireVideoProctoring}
      onCheckedChange={setRequireVideoProctoring}
    />
  </div>

  <div className="flex items-center justify-between">
    <Label htmlFor="requireScreen">Require Screen Recording</Label>
    <Switch
      id="requireScreen"
      checked={requireScreenRecording}
      onCheckedChange={setRequireScreenRecording}
    />
  </div>

  <div className="flex items-center justify-between">
    <Label htmlFor="faceDetection">Enable Face Detection</Label>
    <Switch
      id="faceDetection"
      checked={enableFaceDetection}
      onCheckedChange={setEnableFaceDetection}
    />
  </div>

  <p className="text-xs text-slate-500">
    If required, candidates must grant camera/screen access to start the interview.
  </p>
</div>
```

---

## Hardware Missing & Fault Tolerance Strategies (Alternatives)
To handle scenarios where a candidate lacks a working webcam but still needs to proceed with the interview, the following features will be added to the flow:

### 1. Degrade to "Screen-Only" Mode Logging
If the webcam fails (`NotFoundError`) but screen sharing succeeds, the system can programmatically downgrade the requirement for that session to prevent blocking the candidate entirely.
- **Action:** Show a message on the setup screen: *"Webcam not detected. We will proceed with Screen Recording only."*
- **Resolution:** Allow the candidate to proceed. Heavily flag the `submission` record in the database as **"Screen-Only (Hardware Failure)"**. This ensures the evaluator knows exactly why the video is missing and can evaluate purely based on code playback and browser tab-switching metrics (anti-cheating logs).

### 2. Pre-Interview "System Check" Link
Currently, candidates find out their camera is broken *when* they are trying to start the interview, adding unnecessary stress.
- **Action:** When sending the invite email for the interview, include a "Test My Setup" link.
- **Resolution:** This allows candidates to test their camera, microphone, and screen sharing days in advance. If they discover it's faulty, they have time to borrow a laptop or reach out to the recruiter before the deadline to make alternative arrangements.
