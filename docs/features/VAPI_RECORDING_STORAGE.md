# VAPI Recording Storage Solution

## Problem
VAPI recordings and transcripts were not being permanently stored. VAPI deletes recordings from their servers after some time, leading to data loss.

## Solution
Implemented automatic download and permanent storage of recordings and transcripts in Supabase Storage when webhook receives end-of-call reports.

---

## Changes Made

### 1. New Service: VAPI Recording Service
**File:** `backend/app/services/vapi_recording_service.py`

**Features:**
- Downloads recordings from VAPI temporary URLs
- Uploads to Supabase Storage bucket `interview-recordings`
- Stores transcripts as text files
- Generates permanent public URLs
- Handles multiple audio formats (MP3, WAV, WebM, OGG)

**Methods:**
- `download_and_store_recording()` - Downloads and stores audio recording
- `download_and_store_transcript()` - Stores transcript as .txt file
- `_get_extension_from_content_type()` - Maps MIME types to file extensions

**Storage Structure:**
```
interview-recordings/
└── voice-screening/
    └── {candidate_id}/
        ├── {call_id}.mp3          # Recording
        └── {call_id}_transcript.txt  # Transcript
```

### 2. Updated Webhook Handler
**File:** `backend/app/api/v1/voice_screening.py`

**Changes:**
- Imports `VAPIRecordingService`
- Downloads recording from VAPI URL when webhook received
- Stores recording permanently in Supabase Storage
- Stores transcript as downloadable file
- Updates database with permanent URLs instead of temporary VAPI URLs
- Falls back to VAPI URL if storage fails

**Flow:**
1. Webhook receives end-of-call report from VAPI
2. Extracts `recording_url` and `transcript`
3. Downloads recording from VAPI
4. Uploads to Supabase Storage
5. Saves permanent URL to database
6. VAPI can delete their copy - we have ours!

### 3. Database Migration
**File:** `backend/app/db/migrations/018_add_transcript_url.sql`

**Changes:**
- Adds `transcript_url` column to `voice_candidates` table
- Stores permanent Supabase Storage URL for transcript files

**Schema Update:**
```sql
ALTER TABLE voice_candidates
ADD COLUMN transcript_url TEXT;
```

### 4. Frontend Navigation
**Files:**
- `frontend/src/app/dashboard/voice-screening/page.tsx`
- `frontend/src/app/dashboard/voice-screening/campaigns/page.tsx`

**Changes:**
- Added navigation tabs between "Candidates" and "Campaigns"
- Consistent UI across both pages
- Easy switching between views

---

## Benefits

1. **Permanent Storage**: Recordings never lost, even after VAPI deletes them
2. **Cost Efficiency**: Don't need to pay for VAPI long-term storage
3. **Data Ownership**: Full control over interview data
4. **Downloadable Transcripts**: Transcripts stored as files for easy download
5. **Backup Strategy**: Recordings stored in your Supabase project
6. **Better Performance**: Served from your own CDN (Supabase Storage)

---

## Testing Steps

### 1. Run Migration
```sql
-- In Supabase SQL Editor:
ALTER TABLE voice_candidates
ADD COLUMN IF NOT EXISTS transcript_url TEXT;
```

### 2. Test Recording Storage

1. Create a test candidate
2. Make a test call via VAPI
3. End the call
4. Check webhook logs - should see:
   ```
   Downloading recording from VAPI: https://...
   Recording stored permanently: https://gsazuckbhbzqliykyetj.supabase.co/storage/v1/object/public/interview-recordings/...
   Storing transcript in Supabase Storage
   ```

5. Verify in database:
   ```sql
   SELECT
     name,
     recording_url,    -- Should be Supabase URL, not VAPI URL
     transcript_url,   -- Should be Supabase URL
     status
   FROM voice_candidates
   WHERE call_id = 'your-call-id';
   ```

6. Check Supabase Storage:
   - Go to Supabase Dashboard → Storage → `interview-recordings`
   - Navigate to `voice-screening/{candidate_id}/`
   - Should see `.mp3` and `_transcript.txt` files

### 3. Test Recording Playback

1. Click on candidate in Voice Screening page
2. Click "View Details" (eye icon)
3. Should see recording player and transcript
4. Recording should play from Supabase Storage URL
5. Transcript should be downloadable

---

## Configuration

### Required Environment Variables

**Backend (.env):**
```bash
# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# VAPI Webhook (must be publicly accessible)
FRONTEND_URL=https://your-domain.com  # or ngrok URL
```

### Storage Bucket Setup

The `interview-recordings` bucket should already exist from video interviews setup. If not:

1. Go to Supabase Dashboard → Storage
2. Create bucket: `interview-recordings`
3. Set to Public (for CDN access)
4. Configure RLS policies (allow authenticated users to insert/read)

---

## Error Handling

### If Recording Download Fails
- Webhook logs error but continues
- Falls back to VAPI temporary URL
- Database still updated with other fields
- No data loss for structured data/transcript

### If Storage Upload Fails
- Logs error with full stack trace
- Returns VAPI URL as fallback
- Webhook returns success to prevent VAPI retries

### Network Timeout
- 60-second timeout for download
- Large recordings handled gracefully
- Async processing doesn't block webhook response

---

## Monitoring

### Check Webhook Logs
```bash
# Backend terminal
# Look for these messages:
Downloading recording from VAPI: ...
Downloaded {bytes} bytes
Uploading to Supabase Storage: ...
Recording stored successfully: ...
```

### Check Storage Usage
```sql
-- Supabase SQL Editor
SELECT
  COUNT(*) as total_recordings,
  SUM(metadata->>'size')::bigint as total_bytes
FROM storage.objects
WHERE bucket_id = 'interview-recordings'
  AND name LIKE '%voice-screening%';
```

---

## Future Enhancements

1. **Compression**: Compress recordings before storage (reduce size by 50-70%)
2. **Transcription**: Use Whisper AI for better transcription
3. **Sentiment Analysis**: Analyze tone and sentiment
4. **Highlights**: Extract key moments from recordings
5. **Cleanup Job**: Delete recordings older than X days (compliance)

---

## Troubleshooting

### Recording URL is still VAPI URL
**Cause**: Download failed
**Fix**: Check backend logs for errors, verify network connectivity

### Can't play recording
**Cause**: Storage bucket not public
**Fix**: Go to Supabase Storage → `interview-recordings` → Make Public

### Webhook not firing
**Cause**: VAPI can't reach webhook URL
**Fix**: Use ngrok for local dev, ensure FRONTEND_URL is correct

### Storage quota exceeded
**Cause**: Too many recordings
**Fix**: Upgrade Supabase plan or implement cleanup job

---

## Summary

✅ Recordings automatically downloaded from VAPI
✅ Stored permanently in Supabase Storage
✅ Transcripts saved as downloadable files
✅ Database tracks permanent URLs
✅ No data loss when VAPI deletes recordings
✅ Easy navigation between Candidates and Campaigns

**Next Steps:**
1. Run migration: `018_add_transcript_url.sql`
2. Test with a real VAPI call
3. Verify files appear in Supabase Storage
4. Test recording playback in frontend
