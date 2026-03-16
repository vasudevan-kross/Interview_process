-- Migration 034: Voice Interview Disconnect Tracking
-- Add tracking for microphone disconnection and reconnection events

-- Add disconnect_events column to voice_call_history
ALTER TABLE voice_call_history
  ADD COLUMN IF NOT EXISTS disconnect_events JSONB DEFAULT '[]'::jsonb;

-- Add index for queries filtering by disconnect events
CREATE INDEX IF NOT EXISTS idx_voice_call_history_disconnect_events
  ON voice_call_history USING GIN (disconnect_events);

-- Comments for documentation
COMMENT ON COLUMN voice_call_history.disconnect_events IS
  'Array of disconnection/reconnection events during the call. Format: [{"timestamp": "ISO8601", "event_type": "disconnect|reconnect", "reason": "string", "reconnection_attempt": number}]';

-- Example disconnect_events structure:
-- [
--   {
--     "timestamp": "2026-03-16T14:32:15.000Z",
--     "event_type": "disconnect",
--     "reason": "microphone_hardware_disconnect"
--   },
--   {
--     "timestamp": "2026-03-16T14:32:45.000Z",
--     "event_type": "reconnect_attempt",
--     "reconnection_attempt": 1
--   },
--   {
--     "timestamp": "2026-03-16T14:32:50.000Z",
--     "event_type": "reconnect_success",
--     "reconnection_attempt": 1
--   }
-- ]
