-- ============================================================================
-- Migration 040: Add Organization-Level Multi-tenancy to Pipeline
-- ============================================================================
-- Description: Adds org_id to pipeline_candidates for proper multi-tenant isolation
--              This is critical for scaling to multiple organizations
-- Author: Claude
-- Date: 2026-03-23
-- ============================================================================

-- ============================================================================
-- STEP 1: Add org_id column (nullable first for backfill)
-- ============================================================================

ALTER TABLE pipeline_candidates
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- STEP 2: Backfill org_id from users → organization_members
-- ============================================================================
-- This populates org_id for existing pipeline_candidates by looking up
-- the user's organization membership

UPDATE pipeline_candidates pc
SET org_id = om.org_id
FROM organization_members om
WHERE pc.created_by = om.user_id
  AND pc.org_id IS NULL;

-- ============================================================================
-- STEP 3: Make org_id NOT NULL (after backfill)
-- ============================================================================

-- First, check if there are any rows still missing org_id
DO $$
DECLARE
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM pipeline_candidates
    WHERE org_id IS NULL;

    IF missing_count > 0 THEN
        RAISE NOTICE 'WARNING: % pipeline_candidates still have NULL org_id. These may be orphaned records.', missing_count;
        -- Delete orphaned records without valid created_by user
        DELETE FROM pipeline_candidates WHERE org_id IS NULL;
        RAISE NOTICE 'Deleted % orphaned pipeline_candidates records', missing_count;
    END IF;
END $$;

-- Now make org_id NOT NULL
ALTER TABLE pipeline_candidates
  ALTER COLUMN org_id SET NOT NULL;

-- ============================================================================
-- STEP 4: Add index for org-level queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_org
  ON pipeline_candidates(org_id);

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_org_job
  ON pipeline_candidates(org_id, job_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_org_stage
  ON pipeline_candidates(org_id, current_stage);

-- ============================================================================
-- STEP 5: Update RLS policy to use org_id instead of created_by
-- ============================================================================

-- Drop old user-level policy
DROP POLICY IF EXISTS "Users manage own pipeline candidates" ON pipeline_candidates;

-- Create new org-level policy
CREATE POLICY "Pipeline org isolation" ON pipeline_candidates
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 6: Add trigger to validate org_id matches job's org_id
-- ============================================================================
-- This ensures pipeline candidates can only link to jobs in the same org
-- Note: Using a trigger instead of CHECK constraint because CHECK doesn't allow subqueries

CREATE OR REPLACE FUNCTION validate_pipeline_candidate_org_match()
RETURNS TRIGGER AS $$
DECLARE
    job_org_id UUID;
BEGIN
    -- Skip validation if job_id is NULL
    IF NEW.job_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the org_id of the job_description
    SELECT org_id INTO job_org_id
    FROM job_descriptions
    WHERE id = NEW.job_id;

    -- If job doesn't exist, raise error
    IF job_org_id IS NULL THEN
        RAISE EXCEPTION 'Job description % does not exist', NEW.job_id;
    END IF;

    -- Validate that pipeline candidate's org matches job's org
    IF NEW.org_id != job_org_id THEN
        RAISE EXCEPTION 'Pipeline candidate org_id (%) does not match job description org_id (%)',
            NEW.org_id, job_org_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce org matching
CREATE TRIGGER trigger_validate_pipeline_org_match
    BEFORE INSERT OR UPDATE OF job_id, org_id ON pipeline_candidates
    FOR EACH ROW
    EXECUTE FUNCTION validate_pipeline_candidate_org_match();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify the changes
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'pipeline_candidates'
  AND column_name IN ('org_id', 'job_id', 'created_by')
ORDER BY column_name;

-- Verify indexes were created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'pipeline_candidates'
  AND indexname LIKE '%org%'
ORDER BY indexname;

-- Count pipeline candidates by org
SELECT
  o.name AS organization_name,
  COUNT(pc.id) AS candidate_count
FROM organizations o
LEFT JOIN pipeline_candidates pc ON pc.org_id = o.id
GROUP BY o.id, o.name
ORDER BY candidate_count DESC;
