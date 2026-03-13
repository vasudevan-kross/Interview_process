-- Migration: Add transcript_url column to voice_candidates table
-- This stores the permanent Supabase Storage URL for transcript files

ALTER TABLE voice_candidates
ADD COLUMN IF NOT EXISTS transcript_url TEXT;

COMMENT ON COLUMN voice_candidates.transcript_url IS 'Permanent Supabase Storage URL for transcript file';
