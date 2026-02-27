-- Migration: Add Multi-Language Support for Coding Interviews
-- Description: Allow candidates to choose their preferred programming language
-- Author: Claude Code
-- Date: 2026-02-26

-- Update coding_interviews table to support multiple languages
ALTER TABLE coding_interviews
ADD COLUMN IF NOT EXISTS allowed_languages VARCHAR(50)[] DEFAULT ARRAY['python'];

-- Migrate existing programming_language data to allowed_languages array
UPDATE coding_interviews
SET allowed_languages = ARRAY[programming_language]
WHERE allowed_languages IS NULL OR array_length(allowed_languages, 1) IS NULL;

-- Keep programming_language column for backward compatibility (can be removed later)
-- It now represents the "default" or "suggested" language
COMMENT ON COLUMN coding_interviews.programming_language IS 'Default/suggested language (deprecated, use allowed_languages)';
COMMENT ON COLUMN coding_interviews.allowed_languages IS 'Array of programming languages candidates can choose from. NULL or empty array [] means ANY language allowed (no restrictions)';

-- Add index for faster queries on allowed languages
CREATE INDEX IF NOT EXISTS idx_coding_interviews_allowed_languages ON coding_interviews USING GIN(allowed_languages);

-- Update coding_submissions table to store candidate's language choice
ALTER TABLE coding_submissions
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50);

COMMENT ON COLUMN coding_submissions.preferred_language IS 'Programming language chosen by the candidate from allowed_languages';

-- Verify migration
SELECT id, programming_language, allowed_languages FROM coding_interviews LIMIT 5;
