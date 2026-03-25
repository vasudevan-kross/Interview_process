# Batch System Removal & Pipeline Enhancement Plan

**Date:** 2026-03-23
**Status:** Migration SQL created, ready for execution

---

## 1. Database Migration Status

### ✅ Migration Created
- **File:** `backend/migrations/039_remove_batch_system.sql`
- **Action:** Run this SQL file in Supabase SQL Editor to remove batch system

### Tables to be Removed:
1. `batch_candidates` (junction table)
2. `hiring_batches` (batch configuration)
3. `candidates` (global candidate profiles)

### Triggers & Functions to be Removed:
- `trigger_batch_candidates_updated_at`
- `trigger_update_best_scores`
- `trigger_batch_completion`
- `trigger_increment_batch_participation`
- `trigger_hiring_batches_updated_at`
- `trigger_candidates_updated_at`
- `update_batch_candidates_timestamp()`
- `update_candidate_best_scores()`
- `update_batch_completion_status()`
- `increment_batch_participation()`
- `update_hiring_batches_timestamp()`
- `update_candidates_timestamp()`
- `get_batch_analytics(UUID)`

---

## 2. Existing Pipeline Capabilities

### ✅ Already Implemented in Pipeline:

**Database Schema (`pipeline_candidates` table):**
- ✅ Linked to job descriptions via `job_id UUID REFERENCES job_descriptions(id)`
- ✅ Stage tracking: `current_stage` (resume_screening, technical_assessment, voice_screening, completed)
- ✅ Skipped stages: `skipped_stages TEXT[]`
- ✅ Resume link: `resume_id UUID REFERENCES resumes(id)`
- ✅ Coding interview link: `coding_submission_id UUID REFERENCES coding_submissions(id)`
- ✅ Voice screening link: `voice_candidate_id UUID REFERENCES voice_candidates(id)`
- ✅ Denormalized scores: `resume_match_score`, `coding_score`, `coding_percentage`, `voice_status`
- ✅ Recommendation levels: 'highly_recommended', 'recommended', 'not_recommended', 'pending'
- ✅ Final decision: 'pending', 'selected', 'rejected', 'hold'
- ✅ Multi-tenancy via `created_by UUID REFERENCES users(id)`

**Coding Interviews:**
- ✅ Already has `job_id UUID REFERENCES job_descriptions(id)` (Migration 026)
- ✅ Can be linked to job descriptions

**Interview Candidates:**
- ✅ `interview_candidates` table exists for pre-registered candidates (Migration 024)
- ✅ Links to coding interviews via `interview_id`

---

## 3. Missing Features (Need to Add to Pipeline)

### 🔴 Features from Batch System Not Yet in Pipeline:

1. **Excel Import for Pipeline Candidates**
   - Batch had: Bulk Excel import with auto-detection of columns
   - Pipeline needs: Similar Excel upload to add candidates directly to pipeline

2. **Bulk Resume Upload for Pipeline**
   - Batch had: Upload multiple resumes at once for candidates in a batch
   - Pipeline needs: Upload resumes for pipeline candidates

3. **UI for Pipeline Management**
   - Batch had: Create/Edit batch UI with job description selector
   - Pipeline needs: Enhanced pipeline UI with better candidate management

4. **Organization-Level Multi-tenancy**
   - Batch had: `org_id` field for proper multi-tenant isolation
   - Pipeline has: Only `created_by` (user-level), not org-level
   - **CRITICAL:** Pipeline needs `org_id` column for proper multi-tenant isolation

---

## 4. Code Cleanup Required

### Backend Files to Delete/Update:

**Delete these files:**
- ❌ `backend/app/api/v1/batches.py`
- ❌ `backend/app/services/batch_service.py`
- ❌ `backend/app/schemas/batches.py`

**Update these files (remove batch imports/references):**
- 🔧 `backend/app/api/v1/__init__.py` - Remove batches router registration
- 🔧 `backend/app/services/resume_matching_llm.py` - Remove batch_candidate_id handling

### Frontend Files to Delete/Update:

**Delete these directories:**
- ❌ `frontend/src/app/dashboard/batches/` (entire directory)

**Update these files:**
- ✅ `frontend/src/components/dashboard/nav.tsx` - Already removed batch menu item
- 🔧 `frontend/src/lib/api/client.ts` - Remove batch API methods:
  - `createBatch()`
  - `getBatch()`
  - `updateBatch()`
  - `listBatches()`
  - `addCandidateToBatch()`
  - `bulkAddCandidatesToBatch()`
  - `uploadResumesForBatch()`
  - `bulkUpdateCandidateStage()`

---

## 5. Pipeline Enhancements Needed

### Phase 1: Multi-tenancy Fix (CRITICAL)
```sql
-- Add org_id to pipeline_candidates for proper multi-tenant isolation
ALTER TABLE pipeline_candidates
  ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill org_id from users → organization_members
UPDATE pipeline_candidates pc
SET org_id = om.org_id
FROM organization_members om
WHERE pc.created_by = om.user_id;

-- Make org_id NOT NULL after backfill
ALTER TABLE pipeline_candidates
  ALTER COLUMN org_id SET NOT NULL;

-- Add index for org-level queries
CREATE INDEX idx_pipeline_candidates_org ON pipeline_candidates(org_id);

-- Update RLS policy to use org_id instead of created_by
DROP POLICY IF EXISTS "Users manage own pipeline candidates" ON pipeline_candidates;

CREATE POLICY "Pipeline org isolation" ON pipeline_candidates
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
```

### Phase 2: Excel Import for Pipeline
- Add backend endpoint: `POST /api/v1/pipeline/{job_id}/bulk-import`
- Frontend component: Similar to batch Excel import with auto-detection

### Phase 3: Bulk Resume Upload for Pipeline
- Add backend endpoint: `POST /api/v1/pipeline/{job_id}/bulk-upload-resumes`
- Process resumes for pipeline candidates at resume_screening stage

### Phase 4: Enhanced Pipeline UI
- Better pipeline management page
- Add candidates (manual + Excel)
- Upload resumes for multiple candidates
- Track progress through stages

---

## 6. Execution Checklist

**Step 1: Database Migration**
- [ ] Run `backend/migrations/039_remove_batch_system.sql` in Supabase SQL Editor
- [ ] Verify tables dropped: `SELECT * FROM information_schema.tables WHERE table_name IN ('batch_candidates', 'hiring_batches', 'candidates');`

**Step 2: Backend Code Cleanup**
- [ ] Delete `backend/app/api/v1/batches.py`
- [ ] Delete `backend/app/services/batch_service.py`
- [ ] Delete `backend/app/schemas/batches.py`
- [ ] Update `backend/app/api/v1/__init__.py` (remove batches router)
- [ ] Update `backend/app/services/resume_matching_llm.py` (remove batch handling)

**Step 3: Frontend Code Cleanup**
- [ ] Delete `frontend/src/app/dashboard/batches/` directory
- [ ] Update `frontend/src/lib/api/client.ts` (remove batch methods)
- [ ] Navigation already updated ✅

**Step 4: Pipeline Enhancement - Multi-tenancy**
- [ ] Create migration `040_pipeline_add_org_id.sql`
- [ ] Add org_id column to pipeline_candidates
- [ ] Backfill existing data
- [ ] Update RLS policies

**Step 5: Pipeline Enhancement - Features**
- [ ] Add Excel import endpoint
- [ ] Add bulk resume upload endpoint
- [ ] Build enhanced pipeline UI

---

## 7. Testing Plan

After migration:
1. ✅ Verify batch tables no longer exist
2. ✅ Verify batch API endpoints return 404
3. ✅ Verify existing pipeline functionality still works
4. ✅ Test creating new pipeline candidates
5. ✅ Test multi-tenant isolation with org_id

---

## Notes

- Pipeline already has everything needed structurally
- Main additions: Excel import, bulk resume upload, org-level multi-tenancy
- Simpler than batch system (no separate candidates table)
- Better integration with existing workflow
