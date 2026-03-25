-- ============================================================================
-- Migration 041: Create Hiring Campaigns System
-- ============================================================================
-- Description: Adds hiring campaigns (Pipeline 1, 2, 3...) to organize candidates
--              Supports multiple JDs per campaign and slot-based scheduling
-- Author: Claude
-- Date: 2026-03-23
-- ============================================================================

-- ============================================================================
-- STEP 1: Create hiring_campaigns table
-- ============================================================================

CREATE TABLE IF NOT EXISTS hiring_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Campaign status
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'archived')),

    -- Metadata: slots, target roles, custom fields
    metadata JSONB DEFAULT '{
        "slots": [],
        "target_roles": [],
        "settings": {}
    }'::jsonb,

    -- Audit fields
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique campaign names per organization
    UNIQUE(org_id, name)
);

-- Indexes for hiring_campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON hiring_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON hiring_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON hiring_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON hiring_campaigns(org_id, status);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_campaigns_metadata ON hiring_campaigns USING GIN (metadata);

-- ============================================================================
-- STEP 2: Add campaign_id and slot info to pipeline_candidates
-- ============================================================================

-- Add campaign_id column
ALTER TABLE pipeline_candidates
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES hiring_campaigns(id) ON DELETE SET NULL;

-- Add interview_slot JSONB for slot scheduling
ALTER TABLE pipeline_candidates
    ADD COLUMN IF NOT EXISTS interview_slot JSONB DEFAULT NULL;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_campaign ON pipeline_candidates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_campaign_job ON pipeline_candidates(campaign_id, job_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_campaign_stage ON pipeline_candidates(campaign_id, current_stage);

-- GIN index for interview_slot JSONB queries
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_slot ON pipeline_candidates USING GIN (interview_slot);

-- ============================================================================
-- STEP 3: RLS Policies for hiring_campaigns
-- ============================================================================

ALTER TABLE hiring_campaigns ENABLE ROW LEVEL SECURITY;

-- Org members can view campaigns in their organization
CREATE POLICY "Campaigns org isolation" ON hiring_campaigns
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- STEP 4: Helper Functions
-- ============================================================================

-- Function: Get campaign statistics
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
    WHERE campaign_id = p_campaign_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function: Get campaign candidates summary
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
    GROUP BY jd.title
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Triggers
-- ============================================================================

-- Trigger: Update updated_at timestamp for campaigns
CREATE OR REPLACE FUNCTION update_hiring_campaigns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_hiring_campaigns_updated_at
    BEFORE UPDATE ON hiring_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_hiring_campaigns_timestamp();

-- ============================================================================
-- STEP 6: Comments for documentation
-- ============================================================================

COMMENT ON TABLE hiring_campaigns IS 'Hiring campaigns (Pipeline 1, 2, 3...) to organize candidates by hiring drive';
COMMENT ON COLUMN hiring_campaigns.metadata IS 'Stores slots configuration, target roles, and custom settings';
COMMENT ON COLUMN pipeline_candidates.campaign_id IS 'Links candidate to a hiring campaign';
COMMENT ON COLUMN pipeline_candidates.interview_slot IS 'Stores slot info: {slot: "morning/evening", scheduled_date: "...", time_window: "..."}';

COMMENT ON FUNCTION get_campaign_statistics(UUID) IS 'Returns comprehensive statistics for a campaign';
COMMENT ON FUNCTION get_campaign_candidates_summary(UUID) IS 'Returns candidate counts by job and stage';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables and columns created
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('hiring_campaigns', 'pipeline_candidates')
    AND column_name IN ('id', 'campaign_id', 'interview_slot', 'metadata')
ORDER BY table_name, column_name;

-- Verify indexes created
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('hiring_campaigns', 'pipeline_candidates')
    AND indexname LIKE '%campaign%'
ORDER BY tablename, indexname;

-- Verify functions created
SELECT
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%campaign%'
    AND routine_schema = 'public'
ORDER BY routine_name;
