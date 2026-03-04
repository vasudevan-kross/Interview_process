# Troubleshooting: Structured Data Not Being Extracted

## Problem

After a voice interview ends, the structured data fields are not populated. The UI shows:
- "Interview analysis unavailable"
- Technical Assessment shows "Unknown" and "0%"
- No structured data visible in candidate details

## Root Causes & Solutions

### 1. Campaign Created Before vapi_config Was Implemented

**Symptom:** Old campaigns don't have `analysisPlan.structuredDataPlan` in their vapi_config

**Check:**
```bash
# Visit the debug page
http://localhost:3000/dashboard/voice-screening/debug

# Enter your campaign ID
# Check if "Has Structured Data Plan" shows ✓ or ✗
```

**Solution:** **Recreate the campaign**
- Old campaigns created before the structured output feature won't work
- Create a new campaign with the same settings
- The new campaign will have proper vapi_config with analysisPlan

---

### 2. Call Not Using Campaign vapi_config

**Symptom:** Call was started without the campaign's dynamic configuration

**Causes:**
- Using static `VAPI_ASSISTANT_ID` instead of campaign config
- Test call button not fetching campaign config
- Shareable link not returning vapi_config

**Check Backend Logs:**
```bash
# Look for these log lines after call starts:
✅ Using dynamic campaign configuration
# OR
⚠️ Using static assistant ID
```

**Solution:**

**For Shareable Links:**
- Ensure backend endpoint returns vapi_config:
  ```
  GET /api/v1/voice-screening/candidates/token/{token}
  Response must include: "vapi_config": {...}
  ```

**For Test Calls:**
- Frontend should fetch campaign config before starting:
  ```typescript
  const candidate = await getCandidateByToken(token)
  if (candidate.vapi_config) {
    await vapi.start(candidate.vapi_config)
  }
  ```

---

### 3. VAPI Not Returning Structured Data

**Symptom:** Call completed but VAPI API response has empty `analysis.structuredData`

**Check Backend Logs:**
```bash
# After clicking "Fetch Call Data", look for:
🔍 VAPI analysis object keys: [...]
📊 Extracted structured_data: {...}
⚠️ No structured data extracted from call ...
```

**Possible Causes:**

#### a) Interview Too Short
- VAPI needs sufficient conversation to extract data
- Very short calls (< 30 seconds) may not trigger extraction

**Solution:** Conduct a proper interview with actual conversation

#### b) Fields Not Mentioned in Conversation
- AI didn't ask about the fields
- Candidate didn't provide information

**Solution:**
- Review transcript to verify information was discussed
- Ensure custom questions cover required fields
- Update system prompt to explicitly ask for missing fields

#### c) VAPI API Configuration Issue
- `analysisPlan` enabled but VAPI didn't process it
- VAPI API version mismatch

**Solution:**
- Check VAPI dashboard for call details
- Verify VAPI_PRIVATE_KEY is correct
- Contact VAPI support if persistent

---

### 4. Schema Definition Issues

**Symptom:** Some fields extracted, others missing

**Causes:**
- Unclear field descriptions
- Ambiguous field names
- Complex nested structures

**Solution:** Improve schema definitions

**Bad:**
```json
{
  "exp": {
    "type": "string",
    "description": "exp"
  }
}
```

**Good:**
```json
{
  "total_experience": {
    "type": "string",
    "description": "Total years of professional work experience, including both current and previous roles. Accept formats like '5 years', '5', 'five'."
  }
}
```

---

## Step-by-Step Debugging

### Step 1: Verify Campaign Configuration

1. Go to: `http://localhost:3000/dashboard/voice-screening/debug`
2. Enter your campaign ID
3. Click "Check Configuration"

**Expected Results:**
- ✅ Has VAPI Config
- ✅ Has Analysis Plan
- ✅ Has Structured Data Plan
- Schema Fields Count: > 0

**If any show ✗:** Recreate the campaign

---

### Step 2: Check Call Was Using Correct Config

1. Start backend with logs visible:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. Start an interview (test call or shareable link)

3. Look for log output:
   ```
   ✅ Using dynamic campaign configuration
   ```

**If you see:**
```
⚠️ Using static assistant ID
⚠️ Using inline configuration
```

**Problem:** Call not using campaign config

**Solution:**
- For test calls: Update frontend to fetch campaign config
- For shareable links: Verify backend returns vapi_config

---

### Step 3: Verify VAPI API Response

1. Complete an interview (at least 1-2 minutes)
2. Click "Fetch Call Data" button
3. Check backend logs for:

```bash
🔍 VAPI analysis object keys: ['structuredData', 'summary', ...]
📊 Extracted structured_data: {
  "candidate_name": "John Doe",
  "email": "john@example.com",
  ...
}
📊 Structured data fields count: 5
```

**If structured_data is empty `{}`:**

Check if VAPI returned it:
```bash
🔍 VAPI analysis object keys: []  # ← No 'structuredData' key
```

**Possible causes:**
- VAPI didn't process analysisPlan
- Call too short
- VAPI API issue

**Solution:**
- Test with a longer interview (2+ minutes)
- Manually check VAPI dashboard for the call
- Verify VAPI_PRIVATE_KEY

---

### Step 4: Check Database Storage

1. Connect to your Supabase database
2. Query voice_call_history:

```sql
SELECT
  id,
  candidate_id,
  call_id,
  structured_data,
  created_at
FROM voice_call_history
WHERE candidate_id = 'YOUR_CANDIDATE_ID'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:** `structured_data` column has JSON object with fields

**If NULL or `{}`:** Problem is in VAPI API fetch

---

### Step 5: Test with New Campaign

1. Create a brand new campaign:
   - Name: "Test Structured Data"
   - Job Role: "Test Role"
   - Required Fields: `["candidate_name", "email", "phone_number"]`
   - Custom Questions:
     - "What is your full name?"
     - "What is your email address?"
     - "What is your phone number?"

2. Add a test candidate

3. Start interview via shareable link

4. During interview, explicitly provide:
   - Name
   - Email (say "my email is john at example dot com")
   - Phone

5. End interview

6. Fetch call data

7. Check if structured_data has the 3 fields

**If this works:** Original campaign had configuration issue
**If this doesn't work:** Backend/VAPI integration issue

---

## Quick Fixes

### Fix 1: Recreate Campaign

**When:** Campaign shows ✗ for "Has Structured Data Plan"

**Steps:**
1. Note down campaign settings (job role, questions, fields)
2. Delete old campaign
3. Create new campaign with same settings
4. New campaign will have proper vapi_config

---

### Fix 2: Manual vapi_config Repair (Advanced)

**When:** You can't recreate the campaign

**Steps:**

1. Get campaign ID from URL

2. Call regenerate endpoint (if available):
   ```bash
   POST /api/v1/voice-screening/campaigns/{id}/regenerate-config
   ```

3. Or manually update database:
   ```sql
   -- First, verify current vapi_config
   SELECT vapi_config FROM voice_screening_campaigns WHERE id = 'CAMPAIGN_ID';

   -- If missing analysisPlan, backend team needs to add it
   ```

---

### Fix 3: Add Debug Logging

**When:** Need to see exactly what VAPI returns

**Backend Changes:** (Already added in voice_screening.py)

Check logs for these lines:
```
🔍 VAPI analysis object keys: [...]
📊 Extracted structured_data: {...}
```

---

## Testing Checklist

After fixing, verify:

- [ ] Campaign has vapi_config (check debug page)
- [ ] vapi_config has analysisPlan.structuredDataPlan
- [ ] Schema has > 0 fields
- [ ] Interview uses campaign config (check logs)
- [ ] Interview lasts > 1 minute
- [ ] Candidate mentions the required fields
- [ ] After call, click "Fetch Call Data"
- [ ] Backend logs show extracted structured_data
- [ ] UI displays structured data section
- [ ] Fields are populated (not all "—")

---

## Prevention

### For New Campaigns

✅ Always use the campaign creation page (not direct API calls)
✅ Verify debug page shows all ✓ after creation
✅ Test with a sample interview before sending to real candidates

### For Existing Campaigns

⚠️ Old campaigns (created before structured output feature) won't work
⚠️ Need to recreate or manually update vapi_config

---

## Common Mistakes

### Mistake 1: Using VAPI Dashboard Assistant

❌ Creating assistant in VAPI dashboard
❌ Using static VAPI_ASSISTANT_ID

✅ Use campaign's dynamic vapi_config
✅ Start call with: `vapi.start(candidate.vapi_config)`

### Mistake 2: Interview Too Short

❌ Saying "Hi" then immediately ending
❌ Calls < 30 seconds

✅ Have actual conversation (1-2 minutes minimum)
✅ Mention the required fields in conversation

### Mistake 3: Expecting Auto-Population Without Mention

❌ Expecting fields to be filled without candidate providing info
❌ Fields like "email" filled even if candidate didn't say it

✅ Candidate must verbally provide the information
✅ AI extracts what was said, not what was in database

---

## Still Not Working?

If structured data still not extracting after trying all fixes:

1. **Share Debug Output:**
   - Screenshot from debug page
   - Backend logs (🔍 and 📊 lines)
   - Campaign ID

2. **Check VAPI Dashboard:**
   - Login to vapi.ai
   - Find the call
   - Check if "Analysis" tab shows structured data

3. **Verify Environment:**
   - VAPI_PRIVATE_KEY is set correctly
   - Backend can reach vapi.ai API
   - No firewall blocking requests

4. **Test VAPI API Directly:**
   ```bash
   curl -X GET "https://api.vapi.ai/call/YOUR_CALL_ID" \
     -H "Authorization: Bearer YOUR_VAPI_PRIVATE_KEY"
   ```

   Check if response has `analysis.structuredData`

---

## Summary

**Most Common Cause:** Campaign created before structured output feature
**Quickest Fix:** Recreate the campaign
**Best Test:** New campaign with simple 3-field schema

**Debug Tools:**
- Debug page: `/dashboard/voice-screening/debug`
- Backend logs: Look for 🔍 and 📊 emoji lines
- Database query: Check `voice_call_history.structured_data`

For further assistance, contact the development team with:
- Campaign ID
- Call ID
- Debug page screenshot
- Backend logs
