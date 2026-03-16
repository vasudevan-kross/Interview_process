-- Migration 029: Add org_id to existing tables for multi-tenant isolation
-- org_id is nullable initially; will be set NOT NULL after backfill (migration 030)

-- job_descriptions
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_org ON job_descriptions(org_id);

-- resumes
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_resumes_org ON resumes(org_id);

-- tests (question papers)
ALTER TABLE tests ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_tests_org ON tests(org_id);

-- answer_sheets
ALTER TABLE answer_sheets ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_org ON answer_sheets(org_id);

-- coding_interviews
ALTER TABLE coding_interviews ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_coding_interviews_org ON coding_interviews(org_id);

-- voice_screening_campaigns
ALTER TABLE voice_screening_campaigns ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_voice_screening_campaigns_org ON voice_screening_campaigns(org_id);

-- voice_candidates
ALTER TABLE voice_candidates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_voice_candidates_org ON voice_candidates(org_id);

-- pipeline_candidates
ALTER TABLE pipeline_candidates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_org ON pipeline_candidates(org_id);
