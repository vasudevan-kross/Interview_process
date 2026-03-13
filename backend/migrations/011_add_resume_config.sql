-- Migration: Add Resume Upload Configuration
-- Description: Makes resume upload configurable per interview (mandatory, optional, disabled)
-- Author: Claude Code
-- Date: 2026-02-26

-- Add resume_required field to coding_interviews table
ALTER TABLE coding_interviews
ADD COLUMN IF NOT EXISTS resume_required VARCHAR(20) DEFAULT 'mandatory';
-- Values: 'mandatory', 'optional', 'disabled'

-- Add comment
COMMENT ON COLUMN coding_interviews.resume_required IS 'Resume upload requirement: mandatory, optional, or disabled';

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'coding_interviews' AND column_name = 'resume_required';
