# Campaign & Pipeline Integration Guide

## How Campaigns and Pipeline Work Together

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HIRING CAMPAIGN                           │
│  "Java Developers - March 2026"                                 │
│                                                                   │
│  Job Descriptions:                                               │
│    ├── Senior Java Developer                                     │
│    ├── Junior Java Developer                                     │
│    └── Java Team Lead                                            │
│                                                                   │
│  Interview Slots:                                                │
│    ├── Morning Slot (09:00-12:00)                               │
│    └── Evening Slot (18:00-21:00)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE CANDIDATES                          │
│  (pipeline_candidates table)                                     │
│                                                                   │
│  John Doe                                                        │
│    • campaign_id: <campaign-uuid>                               │
│    • job_id: Senior Java Developer                              │
│    • current_stage: resume_screening                            │
│    • interview_slot: { slot_name: "Morning Slot" }              │
│    • resume_match_score: 85%                                    │
│                                                                   │
│  Jane Smith                                                      │
│    • campaign_id: <campaign-uuid>                               │
│    • job_id: Junior Java Developer                              │
│    • current_stage: technical_assessment                        │
│    • interview_slot: { slot_name: "Evening Slot" }              │
│    • coding_score: 78%                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTERVIEW PIPELINE                            │
│  /dashboard/pipeline                                             │
│                                                                   │
│  Kanban Board View:                                             │
│  ┌─────────┬──────────────┬────────────┬───────────┐           │
│  │ Resume  │ Technical    │ Voice      │ Completed │           │
│  │ Screen  │ Assessment   │ Screening  │           │           │
│  ├─────────┼──────────────┼────────────┼───────────┤           │
│  │ John    │ Jane         │            │           │           │
│  │ (85%)   │ (78%)        │            │           │           │
│  └─────────┴──────────────┴────────────┴───────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Create Campaign
**Page:** `/dashboard/campaigns/create`

**What happens:**
- Create campaign: "Java Developers - March 2026"
- Define slots: Morning, Evening
- Save to `hiring_campaigns` table

### 2. Add Candidates to Campaign
**Page:** `/dashboard/campaigns/[id]`

**Methods:**
- **Excel Import:** Bulk import with auto-mapping
- **Manual Add:** Individual candidate entry

**What happens:**
- Creates record in `pipeline_candidates` table with:
  - `campaign_id` = campaign UUID
  - `job_id` = selected job description
  - `current_stage` = "resume_screening"
  - `interview_slot` = selected slot (if any)

### 3. View in Pipeline
**Page:** `/dashboard/pipeline`

**What you see:**
- All candidates from all campaigns
- Organized by current stage (Kanban board)
- Can filter by campaign
- Can filter by job description

### 4. Process Candidates

**Resume Screening:**
- Upload resume for candidate
- System scores resume vs job description
- Updates `resume_match_score` in pipeline_candidates
- Sets `recommendation` (highly_recommended, recommended, etc.)

**Technical Assessment:**
- Advance candidate to technical_assessment stage
- Link to coding interview
- Candidate takes coding test
- Updates `coding_score` in pipeline_candidates

**Voice Screening:**
- Advance candidate to voice_screening stage
- Link to voice campaign
- Candidate completes voice interview
- Updates `voice_status` in pipeline_candidates

**Completion:**
- Move to completed stage
- Make final decision (selected, rejected, hold)

---

## Current Integration Points

### ✅ Already Connected:

1. **Database Schema:**
   ```sql
   pipeline_candidates table:
     - campaign_id UUID (links to hiring_campaigns)
     - interview_slot JSONB (stores slot assignment)
     - job_id UUID (job description)
     - current_stage TEXT (resume_screening, etc.)
   ```

2. **Campaign View:**
   - Shows all candidates in campaign
   - Displays current stage
   - Shows scores and recommendations
   - Filter by stage and job

3. **Pipeline View:**
   - Can filter by campaign (already in code)
   - Shows candidates from all campaigns
   - Kanban board by stage

### 🔴 What You Need to Do Next:

#### **To see campaign candidates in pipeline:**

1. **Add candidates to your campaign** (you already did this)

2. **Navigate to Pipeline:**
   ```
   http://localhost:3000/dashboard/pipeline
   ```

3. **Filter by campaign:**
   - The pipeline page already has campaign filtering
   - You should see a dropdown to select your campaign
   - This will show only candidates from that campaign

4. **Upload resumes for candidates:**
   - Go back to campaign detail page
   - Click "Upload Resumes" button
   - This will process resumes and update scores

---

## Complete Workflow Example

### Scenario: Hire 50 Java Developers

**Step 1: Create Campaign**
```
Campaign Name: Java Developers - March 2026
Description: Hiring drive for Java developers
Slots:
  - Morning Slot (09:00-12:00)
  - Evening Slot (18:00-21:00)
```

**Step 2: Link Job Descriptions**
- Senior Java Developer
- Junior Java Developer

**Step 3: Import Candidates**
- Upload Excel with 50 candidates
- Auto-map to job descriptions
- Auto-assign to slots

**Result:**
- 50 candidates added to `pipeline_candidates` table
- All linked to campaign
- All in "resume_screening" stage

**Step 4: Process Resumes**
- Upload 50 resume files (bulk)
- System scores each resume
- Updates `resume_match_score` for each candidate
- Sets recommendations

**Step 5: Review in Pipeline**
- Navigate to `/dashboard/pipeline`
- Filter by campaign: "Java Developers - March 2026"
- See all 50 candidates organized by stage
- Highly recommended candidates show up with green badges

**Step 6: Advance to Technical Assessment**
- Select top 20 candidates from resume screening
- Advance to technical assessment
- Create coding interview for Morning Slot
- Create coding interview for Evening Slot
- System sends invites to candidates in each slot

**Step 7: Review Coding Results**
- Candidates complete coding interviews
- Results appear in pipeline
- Sort by coding score
- Select top 10 for voice screening

**Step 8: Voice Screening**
- Advance top 10 to voice screening
- Link to voice campaign
- Candidates complete voice interviews
- Review voice screening results

**Step 9: Final Selection**
- Review all scores and recommendations
- Move 5 candidates to "completed" stage
- Mark as "selected"
- Mark others as "rejected" or "hold"

**Step 10: Track in Campaign**
- Return to campaign detail page
- See statistics:
  - 5 Selected
  - 5 On Hold
  - 40 Rejected
- Export results

---

## Missing Features (To Complete Integration)

### Priority 1: Bulk Resume Upload for Campaign

**What's needed:**
- "Upload Resumes" button functionality
- Bulk upload multiple resume files
- Match resumes to candidates by email or name
- Process all resumes and update scores

**Backend endpoint:**
```python
POST /api/v1/campaigns/{id}/bulk-upload-resumes
```

**Frontend:**
- File upload component (accepts multiple files)
- Match files to candidates
- Show progress bar
- Display results

### Priority 2: Link Coding Interviews to Campaign Slots

**What's needed:**
- Create coding interview for specific slot
- System sends invites to all candidates in that slot
- Time-bound access based on slot schedule

**Example:**
```
Campaign: Java Developers - March 2026
Slot: Morning Slot (March 25, 09:00-12:00)
Candidates: 25 candidates assigned to morning slot

Action: Create Coding Interview for Morning Slot
Result:
  - Creates interview session
  - Sends 25 invites
  - Sets access window: March 25, 09:00-12:00
```

### Priority 3: Enhanced Pipeline Filters

**What's needed:**
- Campaign dropdown filter (already in code, just needs testing)
- Slot filter
- Job description filter
- Score range filter

---

## Testing the Integration

### Test 1: Campaign to Pipeline Flow

1. Create campaign "Test Campaign"
2. Add 3 candidates manually
3. Navigate to `/dashboard/pipeline`
4. Look for campaign filter dropdown
5. Select "Test Campaign"
6. Should see your 3 candidates in "Resume Screening" column

### Test 2: Stage Progression

1. In pipeline, select a candidate
2. Click "Advance" or drag to next stage
3. Return to campaign detail page
4. Candidate should show updated stage

### Test 3: Score Updates

1. Upload resume for candidate (when implemented)
2. Check score in pipeline view
3. Check score in campaign view
4. Both should match

---

## Summary

**The connection already exists!**

When you add candidates to a campaign, they are automatically added to the pipeline with a `campaign_id` link. You can then:

1. ✅ View them in the pipeline (filter by campaign)
2. ✅ Advance them through stages
3. ✅ See their progress in both views
4. ⏳ Upload resumes (needs implementation)
5. ⏳ Link coding interviews to slots (needs implementation)

**Next steps:**
1. Go to `/dashboard/pipeline`
2. Look for your campaign in the filters
3. See your candidates organized by stage
4. Start processing them through the hiring workflow!

The integration is already built into the database schema - you just need to use the pipeline view to manage the candidates you added to your campaign.
