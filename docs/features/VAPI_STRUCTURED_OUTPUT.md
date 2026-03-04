# VAPI Structured Output Integration

## Overview

The Voice Screening system automatically extracts structured data from interview conversations using VAPI's AI-powered analysis. This document explains how structured output works, what data is extracted, and how to use it.

---

## What is Structured Data Extraction?

Structured data extraction is VAPI's feature that automatically captures specific information from voice conversations and returns it in a structured format (JSON). Instead of manually reading through interview transcripts, recruiters get pre-populated fields with candidate information.

### Example

**During the interview:**
- AI: "Can you tell me your current company and role?"
- Candidate: "I work at TechCorp as a Senior Python Developer"

**After the interview:**
- `current_employer`: "TechCorp"
- `current_role`: "Senior Python Developer"

All extracted automatically!

---

## How It Works

### 1. Campaign Creation

When you create a voice screening campaign, the system:

1. **Takes your inputs:**
   - Job role (e.g., "Senior Python Developer")
   - Custom questions (e.g., "What is your experience with Django?")
   - Required fields (e.g., "current_employer", "total_experience", "current_ctc")
   - Candidate type (fresher/experienced)
   - Interview style (conversational/structured/adaptive)

2. **Generates AI prompts using Ollama (mistral:7b):**
   - System prompt (guides the AI interviewer's behavior)
   - Structured data schema (defines what fields to extract)
   - Expected questions (questions the AI will ask)

3. **Builds VAPI configuration with `analysisPlan`:**
   ```json
   {
     "analysisPlan": {
       "structuredDataPlan": {
         "enabled": true,
         "schema": {
           "type": "object",
           "properties": {
             "candidate_name": {
               "type": "string",
               "description": "Full name of the candidate"
             },
             "current_employer": {
               "type": "string",
               "description": "Current employer/company name"
             },
             ...
           }
         }
       }
     }
   }
   ```

4. **Stores everything in the database:**
   - `generated_system_prompt` - AI interviewer instructions
   - `generated_schema` - Field definitions with descriptions and types
   - `vapi_config` - Complete VAPI configuration (ready to use)

### 2. Interview Execution

When a candidate starts an interview:

1. **Frontend calls:** `vapi.start(candidate.vapi_config)`
2. **VAPI creates temporary assistant** with campaign configuration
3. **AI conducts interview:**
   - Follows system prompt instructions
   - Asks custom questions
   - Extracts structured data in real-time
4. **Call ends:** VAPI sends webhook with call ID
5. **Backend fetches call data** from VAPI API
6. **Extracted data stored** in `voice_call_history.structured_data` (JSONB)

### 3. Viewing Results

Recruiters can view structured data in:

1. **Main Voice Screening Page** (`/dashboard/voice-screening`)
   - Click "View Details" on any completed candidate
   - See "Structured Data Extraction" section with all fields

2. **Campaign Detail Page** (`/dashboard/voice-screening/campaigns/[id]`)
   - View schema preview (before interviews)
   - View extracted data for each candidate (after interviews)

---

## Structured Data Schema

### Default Fields (24 fields for experienced candidates)

When you create a campaign, the AI generates a schema based on common interview fields:

| Field | Type | Description |
|-------|------|-------------|
| `candidate_name` | string | Full name of the candidate |
| `gender` | string | Gender of the candidate |
| `email` | string | Email address (converts "at" to "@", "dot" to ".") |
| `phone_number` | string | Phone number |
| `current_work_location` | string | Current work location/city |
| `native_location` | string | Native place/hometown |
| `current_employer` | string | Current employer/company name |
| `work_type` | string | Commute Daily / Weekly 3 days / Remote |
| `employment_type` | string | Full Time or Part Time |
| `current_role` | string | Current role/designation |
| `expertise_in` | string | Area of expertise |
| `total_experience` | string | Total experience in years |
| `certifications` | string | Any certifications |
| `projects_handled` | string | Number of projects handled |
| `current_ctc` | string | Current CTC in LPA |
| `expected_ctc` | string | Expected CTC in LPA |
| `notice_period` | string | Notice period as per company norms |
| `serving_notice_period` | string | Whether currently serving notice (Yes/No) |
| `tentative_joining_date` | string | Tentative joining date |
| `existing_offers` | string | Any existing offers from other companies |
| `available_interview_time` | string | Available time for interviews |
| `current_team_size` | string | Size of current team |
| `current_shift_timing` | string | Current shift timings |
| `reason_for_leaving` | string | Reason for leaving current job |

### Custom Fields

You can customize which fields to extract by specifying `required_fields` when creating a campaign:

```typescript
// Example: Custom fields for fresher candidates
const campaignData = {
  name: "Java Fresher Screening",
  job_role: "Junior Java Developer",
  required_fields: [
    "candidate_name",
    "email",
    "phone_number",
    "college_name",
    "graduation_year",
    "programming_languages",
    "college_projects",
    "internship_experience"
  ],
  candidate_type: "fresher"
}
```

The AI will generate appropriate descriptions and extraction logic for these fields.

---

## UI Display Features

### Campaign Detail Page - Schema Preview

**Before any interviews**, recruiters can see what fields will be extracted:

![Schema Preview](screenshot-schema-preview.png)

Features:
- Visual card layout with field names, types, and descriptions
- Color-coded by field type (string, number, boolean)
- Shows examples where available
- "How it works" explanation

### Candidate Details - Extracted Data

**After an interview**, view the extracted data:

![Extracted Data](screenshot-extracted-data.png)

Features:
- **Teal gradient background** (similar to VAPI templates)
- **Check mark icons** for filled fields
- **Grayed out** empty/missing fields
- **Summary stats** showing "X fields captured / Y total fields"
- **"AI Extracted" badge** to indicate automatic extraction
- **Responsive grid** layout (1-3 columns based on screen size)

### Data Types Handling

- **String values:** Displayed as-is
- **Empty values:** Shown as "—" with gray styling
- **Object/Array values:** Formatted as JSON with syntax highlighting
- **Long text:** Wraps properly with `break-words`

---

## Backend Implementation

### Files Involved

1. **`backend/app/services/vapi_prompt_generator.py`**
   - Generates system prompt using Ollama (mistral:7b)
   - Creates structured data schema from required fields
   - Returns expected questions and conversation flow

2. **`backend/app/services/vapi_config_builder.py`**
   - Builds complete VAPI configuration JSON
   - Converts schema to VAPI `analysisPlan` format
   - Adds voice, transcriber, functions

3. **`backend/app/api/v1/voice_screening.py`**
   - Endpoint: `POST /candidates/token/{token}/fetch-call-data`
   - Fetches call data from VAPI API
   - Extracts `analysis.structuredData` from response
   - Stores in `voice_call_history` table

### Database Storage

```sql
-- Table: voice_call_history
CREATE TABLE voice_call_history (
  id UUID PRIMARY KEY,
  candidate_id UUID REFERENCES voice_candidates(id),
  call_id TEXT,
  structured_data JSONB,  -- ← Structured data stored here
  transcript TEXT,
  recording_url TEXT,
  interview_summary TEXT,
  key_points TEXT[],
  technical_assessment JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

The `structured_data` column is **JSONB**, allowing:
- Dynamic schema (different fields per campaign)
- Efficient querying with PostgreSQL JSON operators
- Full-text search on extracted values

---

## API Flow

### Campaign Creation

```http
POST /api/v1/voice-screening/campaigns
Content-Type: application/json

{
  "name": "Senior Python Developer Screening",
  "job_role": "Senior Python Developer",
  "custom_questions": [
    "What is your experience with Django?",
    "Have you worked with microservices?"
  ],
  "required_fields": [
    "candidate_name",
    "email",
    "current_employer",
    "total_experience",
    "current_ctc"
  ],
  "candidate_type": "experienced",
  "interview_style": "conversational"
}
```

**Response:**
```json
{
  "id": "campaign-uuid",
  "name": "Senior Python Developer Screening",
  "generated_system_prompt": "You are an AI interviewer for Senior Python Developer position...",
  "generated_schema": {
    "candidate_name": {
      "type": "string",
      "description": "Full name of the candidate",
      "example": "John Doe"
    },
    "email": {
      "type": "string",
      "description": "Email address. Convert 'at' to '@' and 'dot' to '.'",
      "example": "john@example.com"
    },
    ...
  },
  "vapi_config": {
    "model": {...},
    "voice": {...},
    "analysisPlan": {
      "structuredDataPlan": {
        "enabled": true,
        "schema": {...}
      }
    }
  }
}
```

### Interview Start

```typescript
// Frontend: Voice interview page
const vapi = new Vapi(VAPI_PUBLIC_KEY)

// Fetch candidate data with vapi_config
const candidate = await getCandidateByToken(token)

// Start interview with dynamic config
if (candidate.vapi_config) {
  await vapi.start(candidate.vapi_config)
}
```

### Call End & Data Extraction

```http
# 1. VAPI sends webhook
POST /api/v1/voice-screening/webhook
Content-Type: application/json

{
  "type": "end-of-call-report",
  "call": {
    "id": "call-uuid",
    "status": "ended"
  }
}

# 2. Frontend fetches call data
POST /api/v1/voice-screening/candidates/token/{token}/fetch-call-data
Content-Type: application/json

{
  "call_id": "call-uuid"
}

# 3. Backend calls VAPI API
GET https://api.vapi.ai/call/{call_id}
Authorization: Bearer {VAPI_PRIVATE_KEY}

# 4. VAPI returns structured data
{
  "id": "call-uuid",
  "status": "ended",
  "transcript": "...",
  "recordingUrl": "...",
  "analysis": {
    "structuredData": {
      "candidate_name": "Jane Smith",
      "email": "jane@example.com",
      "current_employer": "TechCorp",
      "total_experience": "8 years",
      "current_ctc": "20 LPA"
    }
  }
}

# 5. Backend stores in database
INSERT INTO voice_call_history (
  candidate_id,
  call_id,
  structured_data,
  transcript,
  recording_url
) VALUES (...);
```

---

## Advanced Features

### 1. Missing Field Handling

If a candidate doesn't mention certain information:

- **Frontend:** Field shows as "—" with gray styling
- **Backend:** Field is `null` or empty string in JSONB
- **No errors:** System gracefully handles missing data

### 2. Type Conversion

VAPI AI handles spoken-to-text conversion:

**Email:**
- Spoken: "john at example dot com"
- Extracted: "john@example.com"

**Numbers:**
- Spoken: "eight lakhs per annum" or "eight LPA"
- Extracted: "8 LPA"

**Dates:**
- Spoken: "June twenty twenty four"
- Extracted: "June 2024"

### 3. Field Validation

You can specify field types in the schema:

```json
{
  "total_experience_years": {
    "type": "number",
    "description": "Total experience in years as a number"
  },
  "is_available": {
    "type": "boolean",
    "description": "Whether candidate is available to join"
  }
}
```

VAPI will attempt to convert spoken values to the specified type.

### 4. Export to Excel

Structured data can be exported to Excel:

```http
GET /api/v1/voice-screening/export?campaign_id={id}
```

Each structured field becomes a column in the Excel file.

---

## Best Practices

### 1. Clear Field Descriptions

❌ Bad:
```json
{
  "exp": {
    "type": "string",
    "description": "exp"
  }
}
```

✅ Good:
```json
{
  "total_experience": {
    "type": "string",
    "description": "Total years of professional work experience, including both current and previous roles. Accept formats like '5 years', '5', 'five'."
  }
}
```

### 2. Use String for Ambiguous Data

For data that could be spoken in multiple ways (CTC, experience, dates), use `string` type:

```json
{
  "current_ctc": {
    "type": "string",
    "description": "Current CTC in LPA (e.g., '8 LPA', '8.5', 'eight lakhs')"
  }
}
```

You can normalize it in the backend if needed.

### 3. Guide Transformations

Help the AI convert spoken text:

```json
{
  "email": {
    "type": "string",
    "description": "Email address. If spelled out, convert 'at' to '@' and 'dot' to '.', remove spaces"
  }
}
```

### 4. Don't Mark All Fields as Required

Only mark truly essential fields as required in the schema:

```json
{
  "required": ["candidate_name", "email", "phone_number"]
}
```

Optional fields won't cause extraction failures.

---

## Troubleshooting

### Issue: Fields Not Being Extracted

**Possible Causes:**
1. AI didn't ask about those fields during the interview
2. Candidate didn't provide the information
3. Field descriptions are unclear

**Solutions:**
- Ensure custom questions cover the required fields
- Use clear, unambiguous field descriptions
- Review interview transcript to verify information was mentioned

### Issue: Wrong Data Extracted

**Possible Causes:**
1. Ambiguous field description
2. Similar-sounding information in transcript

**Solutions:**
- Make field descriptions more specific
- Add examples in the description
- Use structured questions in custom_questions

### Issue: Structured Data Not Showing in UI

**Possible Causes:**
1. Call data not fetched yet
2. VAPI webhook failed
3. structured_data is empty object

**Solutions:**
- Manually click "Fetch Call Data" button
- Check backend logs for VAPI API errors
- Verify VAPI_PRIVATE_KEY is set correctly

---

## Technical Details

### VAPI Analysis Plan Format

The `analysisPlan` object in VAPI config:

```typescript
{
  "analysisPlan": {
    "structuredDataPlan": {
      "enabled": boolean,        // Enable structured data extraction
      "schema": JSONSchema,      // JSON Schema defining fields
      "messages": [{             // Optional system instructions
        "role": "system",
        "content": "Extract instructions..."
      }]
    }
  }
}
```

### JSON Schema Format

Must be a valid JSON Schema (Draft 7):

```json
{
  "type": "object",
  "properties": {
    "field_name": {
      "type": "string|number|boolean|array|object",
      "description": "What this field represents",
      "example": "Sample value (optional)"
    }
  },
  "required": ["field1", "field2"]  // Optional
}
```

### Supported Types

- **string** - Text values
- **number** - Numeric values (VAPI attempts conversion)
- **boolean** - true/false values
- **array** - Lists of items
- **object** - Nested structures

---

## Future Enhancements

### Planned Features

1. **Field Validation Rules**
   - Email format validation
   - Phone number format validation
   - CTC range validation

2. **Custom Templates**
   - Pre-built schemas for common roles (Java Dev, Python Dev, React Dev)
   - Industry-specific templates (IT, Healthcare, Finance)

3. **AI-Powered Follow-ups**
   - If a required field is missing, AI asks follow-up question
   - Adaptive questioning based on what's already extracted

4. **Real-time Field Visualization**
   - Show fields being populated during the call (via VAPI real-time events)
   - Progress indicator for data completeness

5. **Bulk Edit Schema**
   - Edit field descriptions after campaign creation
   - Regenerate schema for existing campaigns

---

## Summary

The VAPI Structured Output integration provides:

✅ **Automatic data extraction** from voice conversations
✅ **Dynamic schema generation** based on job requirements
✅ **Professional UI display** inspired by VAPI templates
✅ **Complete workflow** from campaign creation to data export
✅ **Flexible storage** with JSONB for campaign-specific fields
✅ **Real-time processing** with webhook-based updates

No manual data entry needed - just create a campaign, add candidates, and let AI handle the rest!

---

## Additional Resources

- **VAPI Documentation:** https://docs.vapi.ai/
- **Sample Files:** `docs/sample_questions_*.csv`
- **Setup Guide:** `docs/features/VOICE_SCREENING_SETUP_COMPLETE.md`
- **Backend Code:** `backend/app/services/vapi_*`
- **Frontend Code:** `frontend/src/app/dashboard/voice-screening/`

For questions or issues, check the troubleshooting section or contact the development team.
