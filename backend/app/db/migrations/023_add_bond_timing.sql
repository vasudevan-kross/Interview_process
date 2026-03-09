-- Migration: Add bond_timing column to coding_interviews
-- Allows recruiter to choose when the bond/terms appears to the candidate:
--   'before_start'      - shown inline on the pre-start screen (candidate must sign before starting)
--   'before_submission' - shown after completing questions, before final submit (existing behaviour)

ALTER TABLE coding_interviews
    ADD COLUMN IF NOT EXISTS bond_timing VARCHAR(20) DEFAULT 'before_submission';

COMMENT ON COLUMN coding_interviews.bond_timing IS 'When bond agreement appears: before_start | before_submission';
