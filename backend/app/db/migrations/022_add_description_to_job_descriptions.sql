-- Migration: Add missing 'description' column to job_descriptions table
-- Fixes PostgREST PGRST204 error: "Could not find the 'description' column of 'job_descriptions' in the schema cache"
--
-- NOTE: This column is now included in 001_initial_schema.sql for fresh setups.
-- This migration exists only for existing databases that were created before this fix.
-- It is safe to run on any existing database — ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE job_descriptions
    ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN job_descriptions.description IS 'Optional free-text description / notes about the job posting';
