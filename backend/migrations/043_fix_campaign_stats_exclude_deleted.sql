-- ============================================================================
-- Migration 043: Fix Campaign Statistics to Exclude Soft-Deleted Candidates
-- ============================================================================
-- Description: Updates campaign statistics functions to filter out deleted_at IS NOT NULL
-- Author: Claude
-- Date: 2026-03-25
-- ============================================================================

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
      AND deleted_at IS NULL;  -- Exclude soft-deleted candidates

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
      AND pc.deleted_at IS NULL  -- Exclude soft-deleted candidates
    GROUP BY jd.title
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
