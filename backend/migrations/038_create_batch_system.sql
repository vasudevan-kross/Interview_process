-- ============================================================================
-- Migration 038: Create Batch System
-- ============================================================================
-- Description: Creates the new batch-based candidate tracking system
--              This will eventually replace the pipeline_candidates system
-- Author: Claude
-- Date: 2025-01-20
-- ============================================================================

-- ============================================================================
-- SECTION 1: CANDIDATES (Global Candidate Profiles)
-- ============================================================================

-- Create candidates table to track candidate identity and best scores across batches
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,

    -- Best scores across all batches (for historical tracking)
    best_resume_score FLOAT,
    best_coding_score FLOAT,
    best_voice_score FLOAT,

    -- Activity tracking
    total_batches_participated INT DEFAULT 0,
    last_activity_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(org_id, email)
);

-- Indexes for candidates
CREATE INDEX idx_candidates_org_email ON candidates(org_id, email);
CREATE INDEX idx_candidates_org_activity ON candidates(org_id, last_activity_at DESC);
CREATE INDEX idx_candidates_email_search ON candidates(email);

-- RLS Policy for candidates
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidates_org_isolation ON candidates
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- SECTION 2: HIRING BATCHES
-- ============================================================================

-- Create hiring_batches table for batch configuration
CREATE TABLE IF NOT EXISTS hiring_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_description_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL,

    -- Module configuration (which steps are enabled)
    configuration JSONB DEFAULT '{
        "enabled_modules": ["resume_screening", "technical_assessment", "voice_screening"],
        "thresholds": {
            "resume_screening": {"highly_recommended": 85, "recommended": 65},
            "technical_assessment": {"pass": 70},
            "voice_screening": {"pass": 75}
        }
    }'::jsonb,

    -- Batch status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),

    -- Metadata (for storing campaign IDs, notes, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,

    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes for hiring_batches
CREATE INDEX idx_batches_org ON hiring_batches(org_id);
CREATE INDEX idx_batches_status ON hiring_batches(status);
CREATE INDEX idx_batches_created_by ON hiring_batches(created_by);
CREATE INDEX idx_batches_job_description ON hiring_batches(job_description_id);
CREATE INDEX idx_batches_deleted_at ON hiring_batches(deleted_at) WHERE deleted_at IS NULL;

-- RLS Policy for hiring_batches
ALTER TABLE hiring_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY batches_org_isolation ON hiring_batches
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- SECTION 3: BATCH CANDIDATES
-- ============================================================================

-- Create batch_candidates table to track candidate journey in each batch
CREATE TABLE IF NOT EXISTS batch_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES hiring_batches(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Current stage tracking (aligns with existing naming convention)
    current_stage TEXT NOT NULL DEFAULT 'resume_screening'
        CHECK (current_stage IN ('resume_screening', 'technical_assessment', 'voice_screening', 'completed')),
    skipped_stages TEXT[] DEFAULT '{}'::text[],

    -- Module-specific results (snapshot for this batch)
    module_results JSONB DEFAULT '{
        "resume_screening": {"status": "pending"},
        "technical_assessment": {"status": "pending"},
        "voice_screening": {"status": "pending"}
    }'::jsonb,

    -- Overall batch-specific decision
    overall_status TEXT DEFAULT 'pending'
        CHECK (overall_status IN ('pending', 'shortlisted', 'rejected', 'hired', 'on_hold')),
    decision_notes TEXT,
    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(batch_id, candidate_id)
);

-- Indexes for batch_candidates
CREATE INDEX idx_batch_candidates_batch ON batch_candidates(batch_id);
CREATE INDEX idx_batch_candidates_candidate ON batch_candidates(candidate_id);
CREATE INDEX idx_batch_candidates_stage ON batch_candidates(current_stage);
CREATE INDEX idx_batch_candidates_status ON batch_candidates(overall_status);
CREATE INDEX idx_batch_candidates_org ON batch_candidates(org_id);

-- GIN index for JSONB queries on module_results
CREATE INDEX idx_batch_candidates_module_results ON batch_candidates USING GIN (module_results);

-- RLS Policy for batch_candidates
ALTER TABLE batch_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_candidates_org_isolation ON batch_candidates
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- SECTION 4: DATABASE TRIGGERS
-- ============================================================================

-- Trigger 1: Auto-update batch status when all candidates complete
CREATE OR REPLACE FUNCTION update_batch_completion_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if all candidates in batch have completed
    IF NOT EXISTS (
        SELECT 1 FROM batch_candidates
        WHERE batch_id = NEW.batch_id
          AND current_stage != 'completed'
    ) THEN
        UPDATE hiring_batches
        SET status = 'completed', updated_at = NOW()
        WHERE id = NEW.batch_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_batch_completion
AFTER UPDATE ON batch_candidates
FOR EACH ROW
WHEN (NEW.current_stage = 'completed' AND OLD.current_stage != 'completed')
EXECUTE FUNCTION update_batch_completion_status();

-- Trigger 2: Update candidate best scores across batches
CREATE OR REPLACE FUNCTION update_candidate_best_scores()
RETURNS TRIGGER AS $$
DECLARE
    resume_score FLOAT;
    coding_score FLOAT;
    voice_score FLOAT;
BEGIN
    -- Extract scores from module_results (handle NULL safely)
    BEGIN
        resume_score := (NEW.module_results->'resume_screening'->>'score')::FLOAT;
    EXCEPTION WHEN OTHERS THEN
        resume_score := NULL;
    END;

    BEGIN
        coding_score := (NEW.module_results->'technical_assessment'->>'score')::FLOAT;
    EXCEPTION WHEN OTHERS THEN
        coding_score := NULL;
    END;

    BEGIN
        voice_score := (NEW.module_results->'voice_screening'->>'score')::FLOAT;
    EXCEPTION WHEN OTHERS THEN
        voice_score := NULL;
    END;

    -- Update best scores in candidates table
    UPDATE candidates
    SET
        best_resume_score = GREATEST(COALESCE(best_resume_score, 0), COALESCE(resume_score, 0)),
        best_coding_score = GREATEST(COALESCE(best_coding_score, 0), COALESCE(coding_score, 0)),
        best_voice_score = GREATEST(COALESCE(best_voice_score, 0), COALESCE(voice_score, 0)),
        last_activity_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.candidate_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_best_scores
AFTER UPDATE ON batch_candidates
FOR EACH ROW
WHEN (NEW.module_results IS DISTINCT FROM OLD.module_results)
EXECUTE FUNCTION update_candidate_best_scores();

-- Trigger 3: Increment batch participation count when candidate is added
CREATE OR REPLACE FUNCTION increment_batch_participation()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE candidates
    SET
        total_batches_participated = total_batches_participated + 1,
        updated_at = NOW()
    WHERE id = NEW.candidate_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_batch_participation
AFTER INSERT ON batch_candidates
FOR EACH ROW
EXECUTE FUNCTION increment_batch_participation();

-- Trigger 4: Update timestamps on hiring_batches
CREATE OR REPLACE FUNCTION update_hiring_batches_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_hiring_batches_updated_at
BEFORE UPDATE ON hiring_batches
FOR EACH ROW
EXECUTE FUNCTION update_hiring_batches_timestamp();

-- Trigger 5: Update timestamps on candidates
CREATE OR REPLACE FUNCTION update_candidates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_candidates_updated_at
BEFORE UPDATE ON candidates
FOR EACH ROW
EXECUTE FUNCTION update_candidates_timestamp();

-- Trigger 6: Update timestamps on batch_candidates
CREATE OR REPLACE FUNCTION update_batch_candidates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_batch_candidates_updated_at
BEFORE UPDATE ON batch_candidates
FOR EACH ROW
EXECUTE FUNCTION update_batch_candidates_timestamp();

-- ============================================================================
-- SECTION 5: HELPER FUNCTIONS
-- ============================================================================

-- Function: Get batch analytics (for dashboard)
CREATE OR REPLACE FUNCTION get_batch_analytics(p_batch_id UUID)
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
        'by_status', jsonb_build_object(
            'pending', COUNT(*) FILTER (WHERE overall_status = 'pending'),
            'shortlisted', COUNT(*) FILTER (WHERE overall_status = 'shortlisted'),
            'rejected', COUNT(*) FILTER (WHERE overall_status = 'rejected'),
            'hired', COUNT(*) FILTER (WHERE overall_status = 'hired'),
            'on_hold', COUNT(*) FILTER (WHERE overall_status = 'on_hold')
        ),
        'avg_scores', jsonb_build_object(
            'resume', ROUND(AVG((module_results->'resume_screening'->>'score')::FLOAT)::numeric, 2),
            'coding', ROUND(AVG((module_results->'technical_assessment'->>'score')::FLOAT)::numeric, 2),
            'voice', ROUND(AVG((module_results->'voice_screening'->>'score')::FLOAT)::numeric, 2)
        )
    )
    INTO result
    FROM batch_candidates
    WHERE batch_id = p_batch_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 6: SEED DATA (Optional - for testing)
-- ============================================================================

-- No seed data for production migration
-- Add test data manually via API or separate test script

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON TABLE candidates IS 'Global candidate profiles tracked across all batches (Migration 038)';
COMMENT ON TABLE hiring_batches IS 'Batch configuration and metadata (Migration 038)';
COMMENT ON TABLE batch_candidates IS 'Candidate journey within specific batches (Migration 038)';
