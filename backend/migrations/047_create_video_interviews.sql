-- Migration 047: Create video interview module (campaigns, candidates, sessions)
-- Purpose: Add organization-scoped video interview tables separate from voice screening

BEGIN;

-- Video Interview Campaigns
CREATE TABLE IF NOT EXISTS video_interview_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Campaign metadata
    name TEXT NOT NULL,
    job_role TEXT NOT NULL,
    description TEXT,
    job_description_text TEXT,
    interview_style TEXT DEFAULT 'structured' CHECK (interview_style IN ('structured', 'adaptive', 'conversational')),
    interview_duration_minutes INTEGER DEFAULT 20,
    is_active BOOLEAN DEFAULT TRUE,

    -- Scheduling
    scheduled_start_time TIMESTAMPTZ,
    scheduled_end_time TIMESTAMPTZ,
    grace_period_minutes INTEGER DEFAULT 15,

    -- Avatar + runtime config
    avatar_config JSONB DEFAULT '{}'::jsonb,
    questions JSONB DEFAULT '[]'::jsonb,
    llm_model TEXT DEFAULT 'qwen2.5:7b',

    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Video Interview Candidates
CREATE TABLE IF NOT EXISTS video_interview_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Campaign link
    campaign_id UUID NOT NULL REFERENCES video_interview_campaigns(id) ON DELETE CASCADE,

    -- Candidate identity
    interview_token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,

    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    latest_session_id UUID,

    -- Timing tracking
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    time_expired BOOLEAN DEFAULT FALSE,

    -- Notes
    recruiter_notes TEXT
);

-- Video Interview Sessions
CREATE TABLE IF NOT EXISTS video_interview_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES video_interview_campaigns(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES video_interview_candidates(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Interview content
    questions JSONB DEFAULT '[]'::jsonb,
    transcript JSONB DEFAULT '[]'::jsonb,
    session_state JSONB DEFAULT '{}'::jsonb,

    -- AI evaluation
    interview_summary TEXT,
    evaluation JSONB DEFAULT '{}'::jsonb,

    -- Recording metadata (stored in Supabase Storage)
    recording_bucket TEXT DEFAULT 'interview-recordings',
    recording_path TEXT,
    recording_content_type TEXT,
    recording_duration_seconds INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_interview_campaigns_org ON video_interview_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_campaigns_active ON video_interview_campaigns(org_id) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_video_interview_campaigns_schedule ON video_interview_campaigns(scheduled_start_time, scheduled_end_time) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_video_interview_candidates_campaign ON video_interview_candidates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_candidates_token ON video_interview_candidates(interview_token);
CREATE INDEX IF NOT EXISTS idx_video_interview_candidates_status ON video_interview_candidates(status);
CREATE INDEX IF NOT EXISTS idx_video_interview_candidates_org ON video_interview_candidates(org_id);

CREATE INDEX IF NOT EXISTS idx_video_interview_sessions_campaign ON video_interview_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_sessions_candidate ON video_interview_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_sessions_org ON video_interview_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_sessions_status ON video_interview_sessions(status);

-- Update updated_at triggers
CREATE TRIGGER update_video_interview_campaigns_updated_at
    BEFORE UPDATE ON video_interview_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_interview_candidates_updated_at
    BEFORE UPDATE ON video_interview_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_interview_sessions_updated_at
    BEFORE UPDATE ON video_interview_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE video_interview_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interview_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_interview_campaigns_org_isolation ON video_interview_campaigns
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY video_interview_candidates_org_isolation ON video_interview_candidates
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY video_interview_sessions_org_isolation ON video_interview_sessions
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY video_interview_campaigns_service_role ON video_interview_campaigns
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY video_interview_candidates_service_role ON video_interview_candidates
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY video_interview_sessions_service_role ON video_interview_sessions
    FOR ALL USING (auth.role() = 'service_role');

COMMIT;
