-- Migration: Remove Video Interview Tables
-- Description: Drops all tables related to video interview functionality.

BEGIN;

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS public.video_interview_responses CASCADE;
DROP TABLE IF EXISTS public.video_interview_evaluations CASCADE;
DROP TABLE IF EXISTS public.video_interview_questions CASCADE;
DROP TABLE IF EXISTS public.video_interview_participants CASCADE;
DROP TABLE IF EXISTS public.video_interviews CASCADE;

-- Cleanup any orphans or related types if they exist (optional, but good practice)
-- Note: Indexes and policies are dropped automatically with CASCADE on the tables.

COMMIT;
