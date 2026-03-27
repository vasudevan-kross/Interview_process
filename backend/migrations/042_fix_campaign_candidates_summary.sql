-- Migration 042: Fix campaign candidates summary return types
-- Purpose: Ensure job_title matches TEXT return type in function

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
        COALESCE(jd.title::text, 'No Job Assigned') AS job_title,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'resume_screening') AS resume_screening_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'technical_assessment') AS technical_assessment_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'voice_screening') AS voice_screening_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'completed') AS completed_count
    FROM pipeline_candidates pc
    LEFT JOIN job_descriptions jd ON pc.job_id = jd.id
    WHERE pc.campaign_id = p_campaign_id
      AND pc.deleted_at IS NULL
    GROUP BY jd.title
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;
