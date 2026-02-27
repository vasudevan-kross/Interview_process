# Video Interviews Feature

Live panel interviews with Daily.co integration, recording, and transcription.

## Overview

The video interview feature allows you to conduct live panel interviews with multiple interviewers and candidates using Daily.co's video platform.

## Key Features

- ✅ **Live Video** - HD video and audio
- ✅ **Panel Interviews** - Multiple interviewers + 1 candidate
- ✅ **Cloud Recording** - Automatic recording to Supabase
- ✅ **Screen Sharing** - Share screens for technical demos
- ✅ **No Credit Card** - 10,000 free minutes/month with Daily.co

## Quick Start

### 1. Get Daily.co API Key (FREE)

```
1. Sign up: https://dashboard.daily.co/signup
2. Verify email
3. Copy API key from: https://dashboard.daily.co/developers
```

### 2. Configure Backend

Update `backend/.env`:
```bash
DAILY_API_KEY=your_api_key_here
ENABLE_VIDEO_INTERVIEWS=true
```

### 3. Schedule Interview

1. Go to `/dashboard/video-interviews`
2. Click "Schedule Interview"
3. Fill in details:
   - Job description
   - Candidate email and name
   - Date and time
   - Duration
   - Interviewers (add multiple)
4. Click "Schedule"

### 4. Join Interview

1. Click interview from list
2. Click "Join Interview" (available 15 min before scheduled time)
3. Allow camera/microphone permissions
4. You're in the live interview! 🎉

## Interview Flow

```
Schedule → Join (15 min early) → Conduct Interview → End → Recording Ready
```

## Features in Detail

### Scheduling
- Select job description
- Add multiple interviewers
- Set date, time, duration
- Optional pre-loaded questions
- Email invitations (coming soon)

### Live Session
- Video grid (adjusts 1-10+ participants)
- Audio/video controls (mute/unmute)
- Screen sharing
- Chat (coming soon)
- Recording indicator

### Recording
- Automatic cloud recording
- Stored in Supabase
- Download capability
- Transcript viewer (when available)

### Post-Interview
- Watch recording
- View transcript
- Evaluate candidate
- Export results

## Technical Details

**Backend:**
- Service: `video_interview_service.py`
- API: `/api/v1/video-interviews`
- Database: `video_interviews` table

**Frontend:**
- Components: `VideoRoom`, `ParticipantGrid`, `VideoControls`
- SDK: `@daily-co/daily-react`
- Pages: Schedule, Details, Live, Recording

## API Endpoints

```bash
POST   /api/v1/video-interviews/schedule         # Schedule interview
GET    /api/v1/video-interviews                  # List interviews
GET    /api/v1/video-interviews/{id}            # Get details
PUT    /api/v1/video-interviews/{id}            # Update interview
DELETE /api/v1/video-interviews/{id}            # Cancel interview
GET    /api/v1/video-interviews/{id}/recording  # Get recording URL
POST   /api/v1/video-interviews/{id}/evaluate   # Submit evaluation
```

## Webhooks

Daily.co sends webhooks for recording events:

```bash
POST /api/v1/video-interviews/webhooks/recording-ready
```

Configure in Daily.co dashboard:
```
Webhook URL: https://your-domain.com/api/v1/video-interviews/webhooks/recording-ready
Event: recording.ready-to-download
```

## Troubleshooting

### "No join token provided"
- **Cause:** Missing token in URL
- **Fix:** Use join link from invitation

### "Failed to join room"
- **Causes:** Invalid token, permissions denied, no camera/mic
- **Fix:** Check browser permissions, try different browser

### "Recording not available"
- **Cause:** Recording still processing (takes 5-10 min)
- **Fix:** Wait and refresh

## Next Steps

See:
- **[Daily.co Integration Guide](daily-co-integration.md)** - Complete setup
- **[Migration Guide](../guides/daily-co-migration.md)** - Migrating from 100ms
- **[Complete Setup](../setup/COMPLETE_SETUP.md)** - Full platform setup

## Resources

- Daily.co Docs: https://docs.daily.co/
- Daily.co React SDK: https://docs.daily.co/reference/daily-react
- Community: https://community.daily.co/
