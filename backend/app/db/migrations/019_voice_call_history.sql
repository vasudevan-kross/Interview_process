-- Voice Call History Table
-- Tracks all calls made to each candidate (supports multiple calls per candidate)

CREATE TABLE IF NOT EXISTS voice_call_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    transcript_url TEXT,

    -- Structured data from VAPI (stored as JSONB for flexibility)
    structured_data JSONB,

    -- Metadata
    call_type TEXT DEFAULT 'test' CHECK (call_type IN ('test', 'actual', 'follow_up', 'rescreen')),
    initiated_by UUID REFERENCES auth.users(id),
    notes TEXT,

    -- VAPI metadata
    vapi_cost_cents INTEGER,
    vapi_duration_minutes DECIMAL(10, 2),
    vapi_metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_voice_call_history_candidate ON voice_call_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_history_call_id ON voice_call_history(call_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_history_status ON voice_call_history(status);
CREATE INDEX IF NOT EXISTS idx_voice_call_history_created_at ON voice_call_history(created_at DESC);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_voice_call_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voice_call_history_updated_at
    BEFORE UPDATE ON voice_call_history
    FOR EACH ROW
    EXECUTE FUNCTION update_voice_call_history_updated_at();

-- RLS policies
ALTER TABLE voice_call_history ENABLE ROW LEVEL SECURITY;

-- Users can view call history for their candidates
CREATE POLICY "Users can view their own voice call history"
    ON voice_call_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

-- Users can insert call history for their candidates
CREATE POLICY "Users can insert voice call history"
    ON voice_call_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

-- Users can update their own call history
CREATE POLICY "Users can update their own voice call history"
    ON voice_call_history FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

-- Service role has full access (for VAPI polling)
CREATE POLICY "Service role full access on voice call history"
    ON voice_call_history FOR ALL
    USING (auth.role() = 'service_role');

-- Allow anonymous read by call_id (for public interview links to fetch their own call)
CREATE POLICY "Anyone can read voice call history by call_id"
    ON voice_call_history FOR SELECT
    USING (true);

-- Comments
COMMENT ON TABLE voice_call_history IS 'Stores complete history of all voice calls made to candidates';
COMMENT ON COLUMN voice_call_history.structured_data IS 'VAPI extracted data as JSONB (flexible schema)';
COMMENT ON COLUMN voice_call_history.call_type IS 'Type of call: test, actual, follow_up, or rescreen';
COMMENT ON COLUMN voice_call_history.vapi_metadata IS 'Additional VAPI metadata (model used, costs, etc.)';
