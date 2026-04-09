-- Migration 048: Add resume fields to video_interview_candidates
-- Allows candidates to upload a resume at registration time so the
-- AI interviewer can ask resume-aware questions during the session.

ALTER TABLE video_interview_candidates
  ADD COLUMN IF NOT EXISTS resume_text   TEXT,
  ADD COLUMN IF NOT EXISTS resume_parsed JSONB;

COMMENT ON COLUMN video_interview_candidates.resume_text   IS 'Raw extracted text from uploaded resume file';
COMMENT ON COLUMN video_interview_candidates.resume_parsed IS 'Structured JSON parsed from resume (name, skills, experience, etc.)';
