# Campaign Candidates Feature

## Overview
Added comprehensive candidate management to the Campaign Details page, allowing users to:
- View all candidates linked to a specific campaign
- Add new candidates directly from the campaign
- View interview recordings and transcripts
- Download recordings and transcripts

---

## Changes Made

### 1. Campaign Details Page Enhancement
**File:** `frontend/src/app/dashboard/voice-screening/campaigns/[id]/page.tsx`

**New Features:**
- **Candidates Section**: Displays all candidates linked to this campaign
- **Add Candidate Button**: Create candidates directly from the campaign (ensures campaign linkage)
- **Candidate Cards**: Show candidate name, email, phone, and status
- **View Details Modal**: Full transcript and recording player
- **Download Buttons**: Download recordings and transcripts

**Key Components:**

#### Candidates List
```typescript
const loadCandidates = async () => {
  const response = await apiClient['client'].get('/api/v1/voice-screening/candidates')
  const allCandidates = response.data.candidates || []
  // Filter only candidates linked to this campaign
  const campaignCandidates = allCandidates.filter(
    (c: VoiceCandidate) => c.campaign_id === resolvedParams.id
  )
  setCandidates(campaignCandidates)
}
```

#### Add Candidate (Campaign-Linked)
```typescript
await apiClient['client'].post('/api/v1/voice-screening/candidates', {
  name: addForm.name,
  email: addForm.email || null,
  phone: addForm.phone || null,
  is_fresher: campaign?.candidate_type === 'fresher',
  campaign_id: resolvedParams.id, // ✅ Linked to campaign
})
```

#### Candidate Detail Modal
- Audio player for recording
- Scrollable transcript view
- Download buttons for recording and transcript
- Display all extracted information fields
- Responsive design

### 2. Updated TypeScript Types
**File:** `frontend/src/lib/api/voice-screening.ts`

**Added:**
```typescript
export interface VoiceCandidate {
  // ... existing fields
  transcript_url?: string // NEW: Permanent Supabase Storage URL for transcript file
}
```

### 3. UI/UX Improvements
- **Status Badges**: Color-coded (green=completed, blue=in_progress, red=failed, gray=pending)
- **Conditional Actions**: "View Details" and download buttons only shown for completed interviews
- **Empty State**: Friendly message when no candidates exist
- **Loading States**: Spinner while loading candidates
- **Responsive Layout**: Works on mobile and desktop

---

## User Workflow

### Creating Campaign-Linked Candidates

1. **Navigate to Campaign**:
   - Go to Voice Screening → Campaigns
   - Click on a campaign

2. **Add Candidate**:
   - Click "Add Candidate" button (top right or in Candidates section)
   - Fill in name (required), email, phone
   - Click "Add Candidate"
   - Candidate is automatically linked to this campaign

3. **View Candidates**:
   - Scroll to "Candidates" section at bottom of page
   - See all candidates with their status
   - Click "View Details" for completed interviews

4. **View Interview Results**:
   - Modal shows:
     - Recording player
     - Full transcript
     - All extracted information (experience, salary, etc.)
   - Download recording and transcript files

---

## Key Features

### ✅ Campaign-Only Workflow
- Candidates added from campaign page are **automatically linked** to that campaign
- They will use the campaign's **AI-generated VAPI configuration**
- No manual selection needed - campaign linkage is automatic

### ✅ Backward Compatibility
- Regular "Add Candidate" button on Voice Screening page still works
- Creates legacy candidates (no campaign_id)
- Uses static VAPI_ASSISTANT_ID configuration
- Both workflows coexist peacefully

### ✅ Recording Permanence
- Recordings are downloaded from VAPI and stored in Supabase Storage
- Transcripts saved as downloadable .txt files
- Both accessible from candidate details modal
- Never lost even if VAPI deletes them

### ✅ Complete View
- Campaign details (prompt, questions, fields)
- All candidates using this campaign
- Their interview results
- Everything in one place

---

## Technical Details

### State Management
```typescript
const [candidates, setCandidates] = useState<VoiceCandidate[]>([])
const [loadingCandidates, setLoadingCandidates] = useState(false)
const [selectedCandidate, setSelectedCandidate] = useState<VoiceCandidate | null>(null)
```

### Data Flow
1. Page loads → `loadCampaign()` and `loadCandidates()` called in parallel
2. Candidates filtered by `campaign_id === resolvedParams.id`
3. User clicks "Add Candidate" → Modal opens
4. Form submitted → API creates candidate with `campaign_id`
5. `loadCandidates()` refreshes list
6. User clicks "View Details" → Modal shows recording + transcript

### API Integration
- **GET** `/api/v1/voice-screening/candidates` - List all candidates (filtered client-side)
- **POST** `/api/v1/voice-screening/candidates` - Create candidate with `campaign_id`

### Storage URLs
- **recording_url**: Supabase Storage URL (permanent)
  - Format: `https://{project}.supabase.co/storage/v1/object/public/interview-recordings/voice-screening/{candidate_id}/{call_id}.mp3`
- **transcript_url**: Supabase Storage URL (permanent)
  - Format: `https://{project}.supabase.co/storage/v1/object/public/interview-recordings/voice-screening/{candidate_id}/{call_id}_transcript.txt`

---

## UI Components

### Candidates Section Card
```tsx
<Card>
  <CardHeader>
    <CardTitle>Candidates ({candidates.length})</CardTitle>
    <Button onClick={() => setShowAddModal(true)}>Add Candidate</Button>
  </CardHeader>
  <CardContent>
    {/* Candidate cards with status badges */}
  </CardContent>
</Card>
```

### Candidate Card
- **Left**: Name, email, phone, status badge
- **Right**: "View Details" button (if completed), Download button

### Detail Modal
- **Header**: Candidate name, contact info
- **Recording Section**: Audio player + download button
- **Transcript Section**: Scrollable pre-formatted text + download button
- **Extracted Info**: Grid of all fields from structured data

---

## Testing Steps

### 1. Create Campaign
1. Go to Voice Screening → Campaigns → Create Campaign
2. Fill in job role, questions, fields
3. Wait for Ollama to generate prompt
4. View campaign details

### 2. Add Candidates
1. Click "Add Candidate" on campaign page
2. Enter name: "Test Candidate"
3. Enter email: "test@example.com"
4. Submit
5. Verify candidate appears in list with "pending" status

### 3. Conduct Interview
1. Copy interview link from candidate card
2. Open in new tab/browser
3. Start VAPI call
4. Complete interview
5. End call

### 4. View Results
1. Wait for webhook to process (~5-10 seconds)
2. Refresh campaign page
3. Candidate status should be "completed"
4. Click "View Details"
5. Play recording
6. Read transcript
7. Download both files

---

## Migration Required

**Run this SQL in Supabase:**
```sql
ALTER TABLE voice_candidates
ADD COLUMN IF NOT EXISTS transcript_url TEXT;
```

**Purpose:** Store permanent URL for transcript files in Supabase Storage.

---

## File Changes Summary

### Modified Files:
1. ✅ `frontend/src/app/dashboard/voice-screening/campaigns/[id]/page.tsx` - Added candidates section + modals
2. ✅ `frontend/src/lib/api/voice-screening.ts` - Added `transcript_url` to VoiceCandidate type
3. ✅ `backend/app/services/vapi_recording_service.py` - Download & store recordings
4. ✅ `backend/app/api/v1/voice_screening.py` - Updated webhook to use recording service
5. ✅ `frontend/src/app/dashboard/voice-screening/page.tsx` - Added Campaigns tab
6. ✅ `frontend/src/app/dashboard/voice-screening/campaigns/page.tsx` - Added Candidates tab

### New Files:
1. ✅ `backend/app/services/vapi_recording_service.py` - Recording storage service
2. ✅ `backend/app/db/migrations/018_add_transcript_url.sql` - Database migration

---

## Benefits

1. **Unified View**: See campaign configuration and results in one place
2. **Easy Management**: Add candidates without leaving campaign page
3. **No Manual Linking**: Campaign linkage is automatic
4. **Complete History**: Never lose recordings or transcripts
5. **Better UX**: Clearer workflow for users
6. **Type Safety**: TypeScript ensures correct data structure

---

## Next Steps

1. ✅ Run migration: `018_add_transcript_url.sql`
2. ✅ Test campaign creation with Ollama
3. ✅ Test adding candidates to campaign
4. ✅ Test interview flow end-to-end
5. ✅ Verify recordings are stored in Supabase Storage
6. ✅ Test download buttons

---

## Troubleshooting

### Candidates not showing
- Check browser console for errors
- Verify `campaign_id` matches in database
- Clear browser cache and refresh

### Recording not playing
- Check Supabase Storage bucket is public
- Verify `recording_url` in database
- Check CORS settings in Supabase

### Transcript not downloading
- Run migration to add `transcript_url` column
- Verify webhook is storing transcript files
- Check Supabase Storage for .txt files

---

**Status:** ✅ Complete and ready for testing!
