# Voice Screening Feature - Complete Setup Guide

## Overview

The voice screening feature has been fully rebuilt with a modern, dynamic schema and AI-powered interview analysis. This document provides a complete guide to using the feature.

## Architecture

### Backend
- **API Router:** `/api/v1/voice-screening/*`
- **Database Tables:**
  - `voice_screening_campaigns` - Campaign configurations
  - `voice_candidates` - Candidate records (minimal fields)
  - `voice_call_history` - Call records with AI summaries

### Frontend
- **Campaigns Page:** `/dashboard/voice-screening/campaigns`
- **Candidates Page:** `/dashboard/voice-screening` (default)
- **Campaign Creation:** `/dashboard/voice-screening/campaigns/new`
- **Campaign Detail:** `/dashboard/voice-screening/campaigns/[id]`

## Quick Start Workflow

### 1. Create a Campaign

Navigate to **Voice Screening > Campaigns > Create Campaign**

**Campaign Fields:**
- **Name:** Campaign identifier (e.g., "Senior React Developer Screening - Q1 2026")
- **Job Role:** Position title (e.g., "Senior React Developer")
- **Description:** Brief overview
- **Job Description:** Full job description text (optional, used for AI context)
- **Technical Requirements:** Specific tech skills needed (optional, for AI assessment)
- **Interview Style:**
  - **Structured:** Fixed questions in order
  - **Adaptive:** Core questions + follow-ups based on answers
  - **Conversational:** Dynamic, natural conversation
- **Interview Persona:**
  - Professional
  - Casual
  - Technical
- **Candidate Type:**
  - Fresher
  - Experienced
  - General
- **Custom Questions:** List of questions to ask
- **Required Fields:** Data fields to extract from interview
- **Knowledge Base Files:** Upload PDFs/docs for AI context (VAPI RAG)

**Click "Generate AI Questions"** to auto-create questions based on job context.

### 2. Add Candidates to Campaign

From the campaign detail page:

**Option A: Add Single Candidate**
- Click "Add Candidate"
- Enter: Name, Email, Phone
- Click "Add"

**Option B: Bulk Import CSV/Excel**
- Click "Import CSV/Excel"
- Upload file with columns: `Name`, `Email`, `Phone`
- System auto-creates interview tokens

### 3. Start Interviews

**Method 1: Test Call (Browser)**
- Navigate to **Voice Screening > Candidates**
- Click phone icon next to candidate
- Speak directly in browser (uses your microphone)
- Call ends automatically or click "End Call"

**Method 2: Shareable Link (Phone)**
- Click copy link icon next to candidate
- Share link with candidate
- They open link and click "Start Interview"
- Interview conducted via phone (VAPI calls their number)

### 4. View AI Analysis

After interview completes:
- Navigate to **Voice Screening > Candidates**
- Click eye icon next to candidate with completed call
- View:
  - **AI Interview Summary:** Full paragraph analysis
  - **Key Points:** Bullet highlights
  - **Technical Assessment:**
    - Experience level
    - Tech stack match percentage
    - Skills mentioned
    - Strengths
    - Gaps
    - Hiring recommendation
    - Decision confidence
  - **Call Recording:** Audio playback
  - **Full Transcript:** Complete conversation text
  - **Extracted Information:** Dynamic fields from JSONB

### 5. Export Results

- Navigate to **Voice Screening > Candidates**
- Click "Export Excel"
- Downloads `.xlsx` file with all candidates and summaries

## Key Features

### 1. Dynamic Schema
- No hardcoded fields in `voice_candidates` table
- All extracted data stored in `structured_data` JSONB column
- Flexible per-campaign field requirements

### 2. Multiple Calls Per Candidate
- Each candidate can have unlimited calls
- Full history tracked in `voice_call_history` table
- View all calls via tabs in detail modal

### 3. AI-Powered Summaries
- **Background Processing:** Summary generated asynchronously after call
- **Model:** Ollama llama2:13b (better reasoning than mistral)
- **Components:**
  - Interview summary (paragraph)
  - Key points (bullet list)
  - Technical assessment (structured evaluation)

### 4. Knowledge Base Integration (VAPI RAG)
- Upload job descriptions, tech docs, company info
- VAPI uses uploaded files as context during interview
- More relevant, informed questions

### 5. Interview Styles
- **Structured:** Asks all questions in fixed order
- **Adaptive:** Starts with core questions, adds follow-ups based on responses
- **Conversational:** Dynamic questioning, natural dialogue flow

### 6. Function Calling
- **end_call:** VAPI auto-ends call when candidate says goodbye
- **flag_concern:** VAPI flags technical/communication concerns during interview

## Environment Variables

### Backend (.env)
```bash
# VAPI (Voice AI)
VAPI_PRIVATE_KEY=your-vapi-private-key
VAPI_ASSISTANT_ID=your-assistant-id  # Optional, uses inline config if not set

# Ollama (for AI summaries)
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_OLLAMA_MODEL=mistral:7b
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your-vapi-public-key
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your-assistant-id  # Optional
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

## API Endpoints

### Campaigns
- `POST /api/v1/voice-screening/campaigns` - Create campaign
- `GET /api/v1/voice-screening/campaigns` - List campaigns
- `GET /api/v1/voice-screening/campaigns/{id}` - Get campaign
- `PATCH /api/v1/voice-screening/campaigns/{id}` - Update campaign
- `DELETE /api/v1/voice-screening/campaigns/{id}` - Delete campaign

### Candidates
- `POST /api/v1/voice-screening/candidates` - Add candidate (requires `campaign_id`)
- `POST /api/v1/voice-screening/candidates/bulk` - Bulk add (requires `campaign_id`)
- `POST /api/v1/voice-screening/candidates/upload` - CSV/Excel upload (requires `campaign_id`)
- `GET /api/v1/voice-screening/candidates` - List candidates (all campaigns)
- `GET /api/v1/voice-screening/candidates/{id}` - Get candidate
- `GET /api/v1/voice-screening/candidates/token/{token}` - Get by token (public)
- `DELETE /api/v1/voice-screening/candidates/{id}` - Delete candidate

### Call History
- `POST /api/v1/voice-screening/candidates/token/{token}/fetch-call-data` - Fetch from VAPI (triggers summary generation)
- `GET /api/v1/voice-screening/candidates/{id}/call-history` - Get all calls

### VAPI Files
- `POST /api/v1/voice-screening/files/upload` - Upload file to VAPI
- `GET /api/v1/voice-screening/files` - List VAPI files
- `DELETE /api/v1/voice-screening/files/{id}` - Delete VAPI file

### Other
- `POST /api/v1/voice-screening/generate-questions` - Generate AI questions
- `POST /api/v1/voice-screening/webhook` - VAPI webhook
- `GET /api/v1/voice-screening/export` - Export to Excel

## Database Schema

### voice_screening_campaigns
```sql
CREATE TABLE voice_screening_campaigns (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    job_role TEXT NOT NULL,
    description TEXT,
    job_description_text TEXT,           -- NEW
    technical_requirements TEXT,          -- NEW
    interview_style TEXT DEFAULT 'conversational',  -- NEW
    knowledge_base_file_ids JSONB DEFAULT '[]'::jsonb,  -- NEW
    vapi_functions JSONB DEFAULT '[]'::jsonb,  -- NEW
    custom_questions JSONB DEFAULT '[]'::jsonb,
    required_fields JSONB DEFAULT '[]'::jsonb,
    interview_persona TEXT DEFAULT 'professional',
    candidate_type TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### voice_candidates
```sql
CREATE TABLE voice_candidates (
    id UUID PRIMARY KEY,
    campaign_id UUID REFERENCES voice_screening_campaigns(id) ON DELETE CASCADE,
    interview_token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending',  -- pending, in_progress, completed, failed
    latest_call_id TEXT,
    recruiter_notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### voice_call_history
```sql
CREATE TABLE voice_call_history (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES voice_candidates(id) ON DELETE CASCADE,
    call_id TEXT UNIQUE NOT NULL,
    call_type TEXT DEFAULT 'vapi_web',
    initiated_by TEXT,

    -- Timing
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Call Data
    transcript TEXT,
    recording_url TEXT,
    structured_data JSONB DEFAULT '{}'::jsonb,  -- Dynamic extracted fields

    -- AI-Generated Analysis (NEW)
    interview_summary TEXT,
    key_points JSONB DEFAULT '[]'::jsonb,
    technical_assessment JSONB DEFAULT '{}'::jsonb,

    -- VAPI Metadata
    vapi_cost_cents INTEGER,
    vapi_duration_minutes NUMERIC,
    vapi_metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Troubleshooting

### Issue: 404 on /api/v1/voice-screening/candidates
**Solution:** Ensure backend router has prefix:
```python
router = APIRouter(prefix="/voice-screening", tags=["voice-screening"])
```

### Issue: No AI summary generated
**Possible causes:**
1. Ollama llama2:13b not installed - run `ollama pull llama2:13b`
2. Ollama not running - check `http://localhost:11434`
3. Background task failed - check backend logs

### Issue: VAPI call fails
**Possible causes:**
1. Missing `VAPI_PUBLIC_KEY` in frontend .env.local
2. Invalid VAPI credentials
3. No VAPI balance/credits

### Issue: Campaigns page shows "No campaigns"
**Solution:**
1. Check backend API is running: `http://localhost:8000/docs`
2. Test API directly: `GET /api/v1/voice-screening/campaigns`
3. Ensure you're logged in (authentication required)

## Best Practices

### Campaign Setup
1. **Upload knowledge base files first** before creating campaign
2. **Use AI question generation** to create initial questions, then edit
3. **Keep required_fields minimal** - only extract what you need
4. **Test with one candidate** before bulk import

### Interview Configuration
- **Fresher candidates:** Use "conversational" style, simpler questions
- **Experienced candidates:** Use "adaptive" style, technical focus
- **Technical roles:** Upload tech docs to knowledge base, use "technical" persona

### Call Management
- **Wait 10 seconds after call ends** before fetching data (VAPI processing time)
- **Review AI summaries** before making hiring decisions (AI is not perfect)
- **Keep recordings** for compliance and quality assurance

## Future Enhancements

- [ ] Real-time call progress updates (WebSocket)
- [ ] Multi-language support (currently English only)
- [ ] Custom AI prompt templates per campaign
- [ ] Automated follow-up email based on assessment
- [ ] Integration with ATS (Applicant Tracking Systems)
- [ ] Sentiment analysis in technical assessment
- [ ] Interview scoring/ranking across candidates
- [ ] Calendar integration for scheduling

## Support

For issues or questions:
1. Check backend logs: `backend/logs/`
2. Check frontend console: Browser DevTools
3. Review API docs: `http://localhost:8000/docs`
4. Check VAPI dashboard: https://dashboard.vapi.ai

---

**Last Updated:** 2026-03-02
**Status:** ✅ Production Ready
