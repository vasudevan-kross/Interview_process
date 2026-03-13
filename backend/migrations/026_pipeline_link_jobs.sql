-- Add optional job_id FK to coding_interviews
ALTER TABLE coding_interviews
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL;

-- Add optional job_id FK to voice_screening_campaigns
ALTER TABLE voice_screening_campaigns
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_coding_interviews_job ON coding_interviews(job_id);
CREATE INDEX IF NOT EXISTS idx_voice_campaigns_job ON voice_screening_campaigns(job_id);
