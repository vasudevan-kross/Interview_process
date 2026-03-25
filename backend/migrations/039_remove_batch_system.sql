-- ============================================================================
-- Migration 039: Remove Batch System
-- ============================================================================
-- Description: Removes the batch system (hiring_batches, batch_candidates, candidates)
--              Pipeline system will be enhanced to replace batch functionality
-- Author: Claude
-- Date: 2026-03-23
-- ============================================================================

-- ============================================================================
-- SECTION 1: DROP TRIGGERS (in reverse dependency order)
-- ============================================================================

-- Drop batch_candidates triggers
DROP TRIGGER IF EXISTS trigger_batch_candidates_updated_at ON batch_candidates;
DROP TRIGGER IF EXISTS trigger_update_best_scores ON batch_candidates;
DROP TRIGGER IF EXISTS trigger_batch_completion ON batch_candidates;
DROP TRIGGER IF EXISTS trigger_increment_batch_participation ON batch_candidates;

-- Drop hiring_batches triggers
DROP TRIGGER IF EXISTS trigger_hiring_batches_updated_at ON hiring_batches;

-- Drop candidates triggers
DROP TRIGGER IF EXISTS trigger_candidates_updated_at ON candidates;

-- ============================================================================
-- SECTION 2: DROP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS update_batch_candidates_timestamp();
DROP FUNCTION IF EXISTS update_candidate_best_scores();
DROP FUNCTION IF EXISTS update_batch_completion_status();
DROP FUNCTION IF EXISTS increment_batch_participation();
DROP FUNCTION IF EXISTS update_hiring_batches_timestamp();
DROP FUNCTION IF EXISTS update_candidates_timestamp();
DROP FUNCTION IF EXISTS get_batch_analytics(UUID);

-- ============================================================================
-- SECTION 3: DROP TABLES (in reverse dependency order)
-- ============================================================================

-- Drop batch_candidates table (has FK to both hiring_batches and candidates)
DROP TABLE IF EXISTS batch_candidates CASCADE;

-- Drop hiring_batches table (has FK to organizations and job_descriptions)
DROP TABLE IF EXISTS hiring_batches CASCADE;

-- Drop candidates table (has FK to organizations)
DROP TABLE IF EXISTS candidates CASCADE;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables were dropped
SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('batch_candidates', 'hiring_batches', 'candidates')
ORDER BY table_name;

-- Expected result: 0 rows (all tables dropped successfully)
