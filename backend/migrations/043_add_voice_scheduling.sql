-- ============================================================================
-- Migration 043: Add Voice Screening Scheduling
-- ============================================================================
-- Description: Add time-based scheduling to voice screening campaigns
--              Similar to coding interviews (scheduled_start/end_time + grace period)
-- Date: 2026-03-26
-- ============================================================================

-- Add scheduling columns to voice_screening_campaigns
ALTER TABLE voice_screening_campaigns
ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_end_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS interview_duration_minutes INTEGER DEFAULT 15;

-- Add timing tracking columns to voice_candidates
ALTER TABLE voice_candidates
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS time_expired BOOLEAN DEFAULT FALSE;

-- Add index for time-based queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_voice_campaigns_scheduled
ON voice_screening_campaigns(scheduled_start_time, scheduled_end_time)
WHERE deleted_at IS NULL AND is_active = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN voice_screening_campaigns.scheduled_start_time IS
'Optional: When interviews can start (NULL = available immediately)';

COMMENT ON COLUMN voice_screening_campaigns.scheduled_end_time IS
'Optional: When interviews must end (NULL = no deadline)';

COMMENT ON COLUMN voice_screening_campaigns.grace_period_minutes IS
'Grace period after scheduled_end_time (default: 15 minutes)';

COMMENT ON COLUMN voice_screening_campaigns.interview_duration_minutes IS
'Maximum call duration per candidate in minutes (default: 15, maps to Vapi maxDurationSeconds)';

COMMENT ON COLUMN voice_candidates.started_at IS
'Timestamp when candidate started the voice call';

COMMENT ON COLUMN voice_candidates.ended_at IS
'Timestamp when candidate ended the voice call';

COMMENT ON COLUMN voice_candidates.time_expired IS
'True if call was terminated due to time limit (maxDurationSeconds)';
