-- Migration 024: Add candidate pipeline support
-- Pre-registered candidates per interview (imported from Excel/CSV)
-- and decision tracking on submissions

-- Pre-registered candidates table
CREATE TABLE IF NOT EXISTS interview_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID NOT NULL REFERENCES coding_interviews(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interview_id, email)
);

-- Index for fast lookup by interview
CREATE INDEX IF NOT EXISTS idx_interview_candidates_interview_id
    ON interview_candidates(interview_id);

-- Decision tracking columns on coding_submissions
ALTER TABLE coding_submissions
    ADD COLUMN IF NOT EXISTS candidate_decision VARCHAR(20) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS decision_notes TEXT,
    ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES auth.users(id);
