# Daily.co Migration Guide - Complete! 🚀

## ✅ What Was Updated

### Backend Changes (COMPLETE):

1. **✅ config.py** - Updated video service configuration
   - Replaced `HMS_` settings with `DAILY_`
   - Now uses: `DAILY_API_KEY` and `DAILY_DOMAIN`

2. **✅ video_interview_service.py** - Complete rewrite for Daily.co
   - Daily.co REST API integration
   - Room creation with privacy controls
   - Meeting token generation
   - Recording webhook support
   - All CRUD operations

3. **✅ package.json** - Updated dependencies
   - Removed: `@100mslive/react-sdk`
   - Added: `@daily-co/daily-react` and `@daily-co/daily-js`

---

## 🔄 Frontend Migration (TODO)

### Files to Update:

#### 1. Video Components Need Replacement

**Current (100ms):**
```typescript
// ParticipantGrid.tsx, VideoRoom.tsx
import { useHMSActions, useHMSStore, selectPeers } from '@100mslive/react-sdk'
```

**New (Daily.co):**
```typescript
import { useDaily, useParticipantIds, useLocalParticipant } from '@daily-co/daily-react'
```

#### 2. Live Page Integration

**Current (100ms):**
```typescript
// live/page.tsx
import { HMSRoomProvider } from '@100mslive/react-sdk'
```

**New (Daily.co):**
```typescript
import { DailyProvider } from '@daily-co/daily-react'
```

---

## 📦 Installation Steps

### 1. Install Dependencies

```bash
cd frontend
npm install --legacy-peer-deps
```

This will install:
- `@daily-co/daily-react@^0.65.0`
- `@daily-co/daily-js@^0.65.0`

### 2. Sign Up for Daily.co

1. Go to: https://dashboard.daily.co/signup
2. Sign up with email (no credit card needed)
3. Verify email
4. Get your API key from: https://dashboard.daily.co/developers

### 3. Configure Backend

Update `backend/.env`:

```bash
# Daily.co Video Service
DAILY_API_KEY=your_api_key_here

# Optional: Custom domain (if you have one)
# DAILY_DOMAIN=yourdomain.daily.co

# Video Settings
ENABLE_VIDEO_INTERVIEWS=true
VIDEO_STORAGE_BUCKET=interview-recordings
ENABLE_AI_VIDEO_ANALYSIS=true

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Supabase (for storage)
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-service-role-key
```

---

## 🔨 Frontend Component Migration

### Option 1: Quick Fix (Simple Wrapper)

I'll create Daily.co wrapper components that match the existing API:

```typescript
// src/hooks/useDaily.ts
export const useDailyActions = () => {
  const callObject = useDaily()
  return {
    join: async (config) => {
      await callObject.join({ url: config.room_url, token: config.authToken })
    },
    leave: async () => {
      await callObject.leave()
    },
    setLocalAudio: (enabled) => {
      callObject.setLocalAudio(enabled)
    },
    setLocalVideo: (enabled) => {
      callObject.setLocalVideo(enabled)
    }
  }
}
```

### Option 2: Full Rewrite (Recommended)

Replace all video components with Daily.co native hooks.

---

## 🎯 Daily.co API Comparison

| Feature | 100ms | Daily.co |
|---------|-------|----------|
| **Provider** | `HMSRoomProvider` | `DailyProvider` |
| **Join** | `hmsActions.join({ authToken })` | `daily.join({ url, token })` |
| **Leave** | `hmsActions.leave()` | `daily.leave()` |
| **Mute Audio** | `setLocalAudioEnabled(false)` | `setLocalAudio(false)` |
| **Mute Video** | `setLocalVideoEnabled(false)` | `setLocalVideo(false)` |
| **Get Peers** | `useHMSStore(selectPeers)` | `useParticipantIds()` |
| **Screen Share** | `setScreenShareEnabled(true)` | `startScreenShare()` |
| **Video Element** | `attachVideo(track, ref)` | `<Video sessionId={id} />` |

---

## 📝 Quick Start (Test Without Frontend Changes)

### Test Backend Only:

```bash
# 1. Start backend
cd backend
uvicorn app.main:app --reload

# 2. Test room creation
curl -X POST http://localhost:8000/api/v1/video-interviews/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "test-job-id",
    "candidate_email": "candidate@example.com",
    "candidate_name": "Test Candidate",
    "scheduled_at": "2026-03-01T10:00:00Z",
    "duration_minutes": 60,
    "interviewers": [
      {"name": "Interviewer 1", "email": "interviewer@example.com"}
    ]
  }'

# Should return: interview_id, room_id, join URLs with tokens
```

---

## 🔄 Complete Frontend Migration Script

I can create a migration script that:
1. Replaces all 100ms imports with Daily.co
2. Updates component hooks
3. Rewrites VideoRoom, ParticipantGrid, VideoControls
4. Updates live page with DailyProvider

**Want me to create these updated components now?**

Just say: "**Update frontend for Daily.co**" and I'll replace all video components!

---

## 🎥 Daily.co Features (Better than 100ms!)

✅ **No Credit Card** - Free tier without payment info
✅ **10,000 Minutes/Month** - Generous free tier
✅ **Cloud Recording** - Automatic recording included
✅ **Transcription API** - Built-in transcription
✅ **Better Docs** - Excellent documentation
✅ **React Hooks** - Modern React 18+ support
✅ **Network Quality** - Better video quality
✅ **Lower Latency** - Faster peer connections

---

## 📊 Migration Status

### Backend: ✅ COMPLETE
- [x] Config updated
- [x] Service rewritten for Daily.co
- [x] Room creation
- [x] Token generation
- [x] Recording webhooks
- [x] Package.json updated

### Frontend: ⏳ PENDING
- [ ] Install Daily.co packages
- [ ] Replace VideoRoom component
- [ ] Replace ParticipantGrid component
- [ ] Replace VideoControls component
- [ ] Update live page with DailyProvider
- [ ] Test end-to-end flow

---

## 🚀 Next Steps

### Option A: Complete Migration (Recommended)

I'll update all frontend components to use Daily.co:

1. VideoRoom.tsx - Use Daily.co hooks
2. ParticipantGrid.tsx - Use participant APIs
3. VideoControls.tsx - Use Daily.co control methods
4. live/page.tsx - Use DailyProvider

**Time:** 15-20 minutes
**Result:** Fully working video interviews with Daily.co

### Option B: Test Backend First

1. Sign up for Daily.co
2. Get API key
3. Update `.env`
4. Test room creation via API
5. Verify webhooks work

**Time:** 5 minutes
**Result:** Backend ready, frontend later

---

## 🎯 Ready to Complete?

**Say one of these:**

1. **"Update frontend for Daily.co"** - I'll complete the migration
2. **"Test backend first"** - I'll guide you through testing
3. **"Show me the changes"** - I'll explain in detail

---

## 📚 Daily.co Resources

**Official Docs:**
- Getting Started: https://docs.daily.co/
- React SDK: https://docs.daily.co/reference/daily-react
- REST API: https://docs.daily.co/reference/rest-api
- Recording: https://docs.daily.co/reference/rest-api/recordings

**Examples:**
- React Demo: https://github.com/daily-co/daily-react-examples
- Video Chat: https://github.com/daily-co/daily-react-tutorial

**Support:**
- Community: https://community.daily.co/
- Status: https://status.daily.co/

---

## ✅ Benefits of This Migration

**Before (100ms):**
- ❌ Required credit card
- ❌ Complex billing setup
- ❌ Limited free tier
- ⚠️ React 18 compatibility issues

**After (Daily.co):**
- ✅ No credit card needed
- ✅ Simple email signup
- ✅ 10,000 free minutes/month
- ✅ Perfect React 19 support
- ✅ Better documentation
- ✅ Cleaner API
- ✅ Built-in transcription

---

## 🎊 Ready When You Are!

Backend is ready to go! Frontend just needs the component updates.

**Want to continue?** Just say "**Update frontend for Daily.co**" 🚀
