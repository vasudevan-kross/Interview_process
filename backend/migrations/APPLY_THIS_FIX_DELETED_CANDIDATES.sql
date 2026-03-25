-- ============================================================================
-- COMPREHENSIVE FIX: Soft Delete Issues
-- ============================================================================
-- This script fixes TWO issues:
-- 1. Duplicate key error when re-adding deleted candidates
-- 2. Deleted candidates still showing in campaign lists and statistics
--
-- INSTRUCTIONS: Copy this entire file and run it in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: Fix Unique Constraint (Migration 042)
-- ============================================================================
-- Issue: Cannot re-add deleted candidates due to unique constraint
-- Solution: Replace with partial unique index that only applies to active rows

-- Step 1: Drop the existing unique constraint
ALTER TABLE pipeline_candidates
    DROP CONSTRAINT IF EXISTS pipeline_candidates_job_id_candidate_email_key;

-- Step 2: Create a partial unique index (only applies when deleted_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_candidates_job_email_active
    ON pipeline_candidates(job_id, candidate_email)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_pipeline_candidates_job_email_active IS
    'Partial unique index - allows re-adding same candidate after deletion';

-- ============================================================================
-- PART 2: Fix Campaign Statistics (Migration 043)
-- ============================================================================
-- Issue: Deleted candidates still counted in statistics and showing in lists
-- Solution: Update functions to filter WHERE deleted_at IS NULL

-- Update get_campaign_statistics function
CREATE OR REPLACE FUNCTION get_campaign_statistics(p_campaign_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_candidates', COUNT(*),
        'by_stage', jsonb_build_object(
            'resume_screening', COUNT(*) FILTER (WHERE current_stage = 'resume_screening'),
            'technical_assessment', COUNT(*) FILTER (WHERE current_stage = 'technical_assessment'),
            'voice_screening', COUNT(*) FILTER (WHERE current_stage = 'voice_screening'),
            'completed', COUNT(*) FILTER (WHERE current_stage = 'completed')
        ),
        'by_decision', jsonb_build_object(
            'pending', COUNT(*) FILTER (WHERE final_decision = 'pending'),
            'selected', COUNT(*) FILTER (WHERE final_decision = 'selected'),
            'rejected', COUNT(*) FILTER (WHERE final_decision = 'rejected'),
            'hold', COUNT(*) FILTER (WHERE final_decision = 'hold')
        ),
        'by_recommendation', jsonb_build_object(
            'highly_recommended', COUNT(*) FILTER (WHERE recommendation = 'highly_recommended'),
            'recommended', COUNT(*) FILTER (WHERE recommendation = 'recommended'),
            'not_recommended', COUNT(*) FILTER (WHERE recommendation = 'not_recommended'),
            'pending', COUNT(*) FILTER (WHERE recommendation = 'pending')
        ),
        'unique_jobs', COUNT(DISTINCT job_id),
        'avg_resume_score', ROUND(AVG(resume_match_score)::numeric, 2),
        'avg_coding_score', ROUND(AVG(coding_score)::numeric, 2)
    )
    INTO result
    FROM pipeline_candidates
    WHERE campaign_id = p_campaign_id
      AND deleted_at IS NULL;  -- KEY FIX: Exclude soft-deleted candidates

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update get_campaign_candidates_summary function
CREATE OR REPLACE FUNCTION get_campaign_candidates_summary(p_campaign_id UUID)
RETURNS TABLE(
    job_title TEXT,
    total_count BIGINT,
    resume_screening_count BIGINT,
    technical_assessment_count BIGINT,
    voice_screening_count BIGINT,
    completed_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(jd.title, 'No Job Assigned') AS job_title,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'resume_screening') AS resume_screening_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'technical_assessment') AS technical_assessment_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'voice_screening') AS voice_screening_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'completed') AS completed_count
    FROM pipeline_candidates pc
    LEFT JOIN job_descriptions jd ON pc.job_id = jd.id
    WHERE pc.campaign_id = p_campaign_id
      AND pc.deleted_at IS NULL  -- KEY FIX: Exclude soft-deleted candidates
    GROUP BY jd.title
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the fixes worked:

-- 1. Check if partial unique index was created
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'pipeline_candidates'
-- AND indexname = 'idx_pipeline_candidates_job_email_active';

-- 2. Test re-adding a deleted candidate (should work now)
-- First add, then delete, then re-add same candidate - should succeed

-- 3. Check statistics now exclude deleted candidates
-- SELECT get_campaign_statistics('your-campaign-id-here');

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- After running this script:
-- ✅ You can delete and re-add candidates without errors
-- ✅ Deleted candidates won't show in campaign lists
-- ✅ Campaign statistics will be accurate (excluding deleted candidates)
-- ============================================================================
