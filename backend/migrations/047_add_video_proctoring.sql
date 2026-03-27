-- ============================================================================
-- Migration 047: Add Video Proctoring for Coding Interviews
-- ============================================================================
-- Description: Adds video proctoring session tracking for technical assessments.
--              Stores webcam and screen recording metadata with chunk upload status.
-- Date: 2026-03-27
-- ============================================================================

-- Table to track video proctoring sessions (one per submission)
CREATE TABLE IF NOT EXISTS video_proctoring_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES coding_submissions(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),

  -- Webcam recording
  webcam_storage_path TEXT,
  webcam_chunk_count INTEGER DEFAULT 0,
  webcam_duration_seconds INTEGER,
  webcam_size_bytes BIGINT,
  webcam_upload_status TEXT DEFAULT 'pending'
    CHECK (webcam_upload_status IN ('pending', 'uploading', 'completed', 'failed')),
  webcam_uploaded_at TIMESTAMPTZ,

  -- Screen recording
  screen_storage_path TEXT,
  screen_chunk_count INTEGER DEFAULT 0,
  screen_duration_seconds INTEGER,
  screen_size_bytes BIGINT,
  screen_upload_status TEXT DEFAULT 'pending'
    CHECK (screen_upload_status IN ('pending', 'uploading', 'completed', 'failed')),
  screen_uploaded_at TIMESTAMPTZ,

  -- Face detection events (logged from client)
  face_detection_enabled BOOLEAN DEFAULT FALSE,
  face_absence_events JSONB DEFAULT '[]'::jsonb,    -- [{timestamp, duration_seconds}]
  multiple_faces_events JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  is_mobile BOOLEAN DEFAULT FALSE,
  browser_info TEXT,
  recording_started_at TIMESTAMPTZ,
  recording_ended_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_proctoring_submission ON video_proctoring_sessions(submission_id);
CREATE INDEX IF NOT EXISTS idx_video_proctoring_org ON video_proctoring_sessions(org_id);

-- Link video session back to submission
ALTER TABLE coding_submissions
  ADD COLUMN IF NOT EXISTS video_session_id UUID REFERENCES video_proctoring_sessions(id);

-- RLS: Same org only
ALTER TABLE video_proctoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_proctoring_sessions_policy ON video_proctoring_sessions
  FOR ALL
  USING (
    org_id IN (
      SELECT om.org_id
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- ============================================================================
-- End of Migration 047
-- ============================================================================
