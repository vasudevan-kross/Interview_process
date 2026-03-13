-- Pipeline Tracking: Unified candidate lifecycle across Resume -> Coding -> Voice
-- Run this migration in Supabase SQL Editor

-- 1. Add pipeline settings to job_descriptions
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS pipeline_settings JSONB DEFAULT '{
  "highly_recommended_threshold": 85,
  "recommended_threshold": 65
}'::jsonb;

-- 2. Create pipeline_candidates table
CREATE TABLE IF NOT EXISTS pipeline_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,

  -- Stage tracking
  current_stage TEXT NOT NULL DEFAULT 'resume_screening'
    CHECK (current_stage IN ('resume_screening', 'technical_assessment', 'voice_screening', 'completed')),
  skipped_stages TEXT[] DEFAULT '{}',

  -- Cross-module foreign keys (nullable — populated as candidate advances)
  resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  coding_submission_id UUID REFERENCES coding_submissions(id) ON DELETE SET NULL,
  voice_candidate_id UUID REFERENCES voice_candidates(id) ON DELETE SET NULL,

  -- Denormalized scores for fast Kanban reads
  resume_match_score FLOAT,
  coding_score FLOAT,
  coding_percentage FLOAT,
  voice_status TEXT,

  -- Recommendation (set when added to pipeline, based on thresholds)
  recommendation TEXT DEFAULT 'pending'
    CHECK (recommendation IN ('highly_recommended', 'recommended', 'not_recommended', 'pending')),

  -- Final hiring decision
  final_decision TEXT DEFAULT 'pending'
    CHECK (final_decision IN ('pending', 'selected', 'rejected', 'hold')),
  decision_notes TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id, candidate_email)
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_job_stage ON pipeline_candidates(job_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_email ON pipeline_candidates(candidate_email);
CREATE INDEX IF NOT EXISTS idx_pipeline_created_by ON pipeline_candidates(created_by);

-- 4. Row Level Security
ALTER TABLE pipeline_candidates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own pipeline candidates
CREATE POLICY "Users manage own pipeline candidates"
  ON pipeline_candidates
  FOR ALL
  USING (created_by = auth.uid());

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_pipeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pipeline_candidates_updated_at
  BEFORE UPDATE ON pipeline_candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_updated_at();
