-- ============================================================================
-- Migration 042: Fix Soft Delete - Replace Unique Constraint with Partial Index
-- ============================================================================
-- Description: Allows re-adding deleted candidates by making unique constraint
--              only apply to non-deleted rows (where deleted_at IS NULL)
-- Author: Claude
-- Date: 2026-03-25
-- ============================================================================

-- Step 1: Drop the existing unique constraint
ALTER TABLE pipeline_candidates
    DROP CONSTRAINT IF EXISTS pipeline_candidates_job_id_candidate_email_key;

-- Step 2: Create a partial unique index that only applies to non-deleted rows
-- This allows the same (job_id, candidate_email) to exist multiple times
-- as long as only one is active (deleted_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_candidates_job_email_active
    ON pipeline_candidates(job_id, candidate_email)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- Verification
-- ============================================================================

-- Test: This should work now - add, delete, re-add same candidate
-- SELECT job_id, candidate_email, deleted_at FROM pipeline_candidates
-- WHERE candidate_email = 'test@example.com';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
