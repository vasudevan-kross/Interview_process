-- Migration: Complete Voice Screening Schema Rebuild
-- Description: Drop old schema and create clean, flexible voice screening system
-- Date: 2026-03-02
-- FRESH START - No existing data

-- ============================================================================
-- STEP 1: DROP OLD TABLES (CASCADE to remove dependencies)
-- ============================================================================

DROP TABLE IF EXISTS voice_call_history CASCADE;
DROP TABLE IF EXISTS voice_candidates CASCADE;
DROP TABLE IF EXISTS voice_screening_campaigns CASCADE;

-- ============================================================================
-- STEP 2: CREATE NEW CAMPAIGNS TABLE (with knowledge base support)
-- ============================================================================

CREATE TABLE voice_screening_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Campaign metadata
    name TEXT NOT NULL,
    job_role TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,

    -- Job requirements (for AI context)
    job_description_text TEXT,
    technical_requirements TEXT,

    -- User-provided configuration
    custom_questions TEXT[] DEFAULT '{}',
    required_fields TEXT[] DEFAULT '{}', -- Dynamic field names to extract
    interview_persona TEXT DEFAULT 'professional' CHECK (interview_persona IN ('professional', 'casual', 'technical')),
    candidate_type TEXT DEFAULT 'general' CHECK (candidate_type IN ('fresher', 'experienced', 'general')),
    interview_style TEXT DEFAULT 'conversational' CHECK (interview_style IN ('structured', 'adaptive', 'conversational')),

    -- AI-generated VAPI configuration
    generated_system_prompt TEXT NOT NULL,
    generated_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    vapi_config JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- VAPI knowledge base integration
    knowledge_base_file_ids JSONB DEFAULT '[]'::jsonb, -- Array of VAPI file IDs
    vapi_functions JSONB DEFAULT '[]'::jsonb, -- Function calling definitions

    -- Model tracking
    generation_model TEXT,
    generation_metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- STEP 3: CREATE NEW CANDIDATES TABLE (minimal, clean)
-- ============================================================================

CREATE TABLE voice_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Campaign link
    campaign_id UUID REFERENCES voice_screening_campaigns(id) ON DELETE CASCADE,

    -- Candidate identity
    interview_token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,

    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    latest_call_id TEXT, -- Reference to most recent call in call_history

    -- Notes
    recruiter_notes TEXT
);

-- ============================================================================
-- STEP 4: CREATE NEW CALL HISTORY TABLE (with summary support)
-- ============================================================================

CREATE TABLE voice_call_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to candidate
    candidate_id UUID NOT NULL REFERENCES voice_candidates(id) ON DELETE CASCADE,

    -- Call identification
    call_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'no_answer', 'busy')),

    -- Call timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Call content
    transcript TEXT,
    recording_url TEXT,

    -- Dynamically extracted data (flexible JSONB schema per campaign)
    structured_data JSONB DEFAULT '{}'::jsonb,

    -- AI-generated analysis
    interview_summary TEXT, -- 2-3 sentence overall assessment
    key_points JSONB DEFAULT '[]'::jsonb, -- Array of key takeaways
    technical_assessment JSONB DEFAULT '{}'::jsonb, -- Skills evaluation, recommendation

    -- Metadata
    call_type TEXT DEFAULT 'actual' CHECK (call_type IN ('test', 'actual', 'follow_up', 'rescreen')),
    initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,

    -- VAPI metadata
    vapi_cost_cents INTEGER,
    vapi_duration_minutes DECIMAL(10, 2),
    vapi_metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- STEP 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Campaign indexes
CREATE INDEX idx_campaigns_active ON voice_screening_campaigns(is_active, created_by);
CREATE INDEX idx_campaigns_created_by ON voice_screening_campaigns(created_by);
CREATE INDEX idx_campaigns_job_role ON voice_screening_campaigns(job_role);

-- Candidate indexes
CREATE INDEX idx_candidates_campaign ON voice_candidates(campaign_id);
CREATE INDEX idx_candidates_token ON voice_candidates(interview_token);
CREATE INDEX idx_candidates_status ON voice_candidates(status);
CREATE INDEX idx_candidates_created_by ON voice_candidates(created_by);

-- Call history indexes
CREATE INDEX idx_call_history_candidate ON voice_call_history(candidate_id);
CREATE INDEX idx_call_history_call_id ON voice_call_history(call_id);
CREATE INDEX idx_call_history_status ON voice_call_history(status);
CREATE INDEX idx_call_history_created_at ON voice_call_history(created_at DESC);

-- ============================================================================
-- STEP 6: CREATE AUTO-UPDATE TRIGGERS
-- ============================================================================

-- Campaigns updated_at trigger
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON voice_screening_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_campaigns_updated_at();

-- Candidates updated_at trigger
CREATE OR REPLACE FUNCTION update_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_updated_at
    BEFORE UPDATE ON voice_candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_candidates_updated_at();

-- Call history updated_at trigger
CREATE OR REPLACE FUNCTION update_call_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_history_updated_at
    BEFORE UPDATE ON voice_call_history
    FOR EACH ROW
    EXECUTE FUNCTION update_call_history_updated_at();

-- ============================================================================
-- STEP 7: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE voice_screening_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_call_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 8: RLS POLICIES - CAMPAIGNS
-- ============================================================================

CREATE POLICY campaigns_select_own
    ON voice_screening_campaigns FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY campaigns_insert_own
    ON voice_screening_campaigns FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY campaigns_update_own
    ON voice_screening_campaigns FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY campaigns_delete_own
    ON voice_screening_campaigns FOR DELETE
    USING (auth.uid() = created_by);

-- Service role full access
CREATE POLICY campaigns_service_role
    ON voice_screening_campaigns FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- STEP 9: RLS POLICIES - CANDIDATES
-- ============================================================================

CREATE POLICY candidates_select_own
    ON voice_candidates FOR SELECT
    USING (auth.uid() = created_by);

CREATE POLICY candidates_insert_own
    ON voice_candidates FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY candidates_update_own
    ON voice_candidates FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY candidates_delete_own
    ON voice_candidates FOR DELETE
    USING (auth.uid() = created_by);

-- Service role full access (for webhooks)
CREATE POLICY candidates_service_role
    ON voice_candidates FOR ALL
    USING (auth.role() = 'service_role');

-- Anonymous read by token (for public interview links)
CREATE POLICY candidates_public_by_token
    ON voice_candidates FOR SELECT
    USING (true);

-- ============================================================================
-- STEP 10: RLS POLICIES - CALL HISTORY
-- ============================================================================

CREATE POLICY call_history_select_own
    ON voice_call_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

CREATE POLICY call_history_insert_own
    ON voice_call_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

CREATE POLICY call_history_update_own
    ON voice_call_history FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

-- Service role full access (for VAPI webhooks and polling)
CREATE POLICY call_history_service_role
    ON voice_call_history FOR ALL
    USING (auth.role() = 'service_role');

-- Anonymous read by call_id (for public interview links)
CREATE POLICY call_history_public_by_call_id
    ON voice_call_history FOR SELECT
    USING (true);

-- ============================================================================
-- STEP 11: ADD HELPFUL COMMENTS
-- ============================================================================

COMMENT ON TABLE voice_screening_campaigns IS 'Voice interview campaigns with AI-generated VAPI configurations and knowledge base support';
COMMENT ON TABLE voice_candidates IS 'Minimal candidate info - all extracted data lives in call_history.structured_data';
COMMENT ON TABLE voice_call_history IS 'Complete history of all calls with dynamic structured_data, AI summaries, and assessments';

COMMENT ON COLUMN voice_screening_campaigns.knowledge_base_file_ids IS 'Array of VAPI file IDs for RAG knowledge base';
COMMENT ON COLUMN voice_screening_campaigns.vapi_functions IS 'VAPI function calling definitions (e.g., end_call)';
COMMENT ON COLUMN voice_screening_campaigns.interview_style IS 'structured (fixed questions), adaptive (follow-ups), conversational (dynamic)';

COMMENT ON COLUMN voice_candidates.latest_call_id IS 'Reference to most recent call in voice_call_history';
COMMENT ON COLUMN voice_call_history.structured_data IS 'Dynamically extracted data per campaign schema (JSONB for flexibility)';
COMMENT ON COLUMN voice_call_history.interview_summary IS 'AI-generated 2-3 sentence assessment';
COMMENT ON COLUMN voice_call_history.key_points IS 'Array of key takeaways (strengths, weaknesses, notable mentions)';
COMMENT ON COLUMN voice_call_history.technical_assessment IS 'Skills evaluation with recommendation (Yes/No/Maybe)';
