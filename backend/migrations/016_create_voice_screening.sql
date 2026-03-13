-- Voice Screening Candidates Table
-- Stores candidate data for Vapi voice AI screening calls

CREATE TABLE IF NOT EXISTS voice_candidates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    -- Candidate identity
    interview_token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_fresher BOOLEAN DEFAULT FALSE,

    -- Call status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    call_id TEXT,  -- Vapi call ID

    -- Extracted fields (populated by Vapi webhook)
    gender TEXT,
    current_work_location TEXT,
    native_location TEXT,
    current_employer TEXT,
    work_type TEXT,
    employment_type TEXT,
    "current_role" TEXT,
    expertise_in TEXT,
    total_experience TEXT,
    certifications TEXT,
    projects_handled TEXT,
    current_ctc TEXT,
    expected_ctc TEXT,
    notice_period TEXT,
    serving_notice_period TEXT,
    tentative_joining_date TEXT,
    existing_offers TEXT,
    available_interview_time TEXT,
    current_team_size TEXT,
    current_shift_timing TEXT,
    reason_for_leaving TEXT,

    -- Call data
    transcript TEXT,
    recording_url TEXT
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_voice_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voice_candidates_updated_at
    BEFORE UPDATE ON voice_candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_voice_candidates_updated_at();

-- RLS policies
ALTER TABLE voice_candidates ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own candidates
CREATE POLICY "Users can view their own voice candidates"
    ON voice_candidates FOR SELECT
    USING (auth.uid() = created_by);

-- Authenticated users can insert candidates
CREATE POLICY "Users can insert voice candidates"
    ON voice_candidates FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Authenticated users can update their own candidates
CREATE POLICY "Users can update their own voice candidates"
    ON voice_candidates FOR UPDATE
    USING (auth.uid() = created_by);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role full access on voice candidates"
    ON voice_candidates FOR ALL
    USING (auth.role() = 'service_role');

-- Allow anonymous read by token (for shareable links)
CREATE POLICY "Anyone can read voice candidate by token"
    ON voice_candidates FOR SELECT
    USING (true);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_voice_candidates_token ON voice_candidates(interview_token);
CREATE INDEX IF NOT EXISTS idx_voice_candidates_created_by ON voice_candidates(created_by);
CREATE INDEX IF NOT EXISTS idx_voice_candidates_status ON voice_candidates(status);
