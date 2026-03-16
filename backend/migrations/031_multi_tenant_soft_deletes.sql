-- Migration 031: Add soft delete support for team-managed tables

ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE coding_interviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE voice_screening_campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE pipeline_candidates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial indexes for efficient queries on non-deleted rows
CREATE INDEX IF NOT EXISTS idx_job_descriptions_active ON job_descriptions(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coding_interviews_active ON coding_interviews(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_voice_campaigns_active ON voice_screening_campaigns(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tests_active ON tests(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_active ON pipeline_candidates(org_id) WHERE deleted_at IS NULL;
