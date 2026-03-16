-- COMPREHENSIVE MIGRATION: Fix User ID Foreign Keys across all tables
-- Description: Aligns all user-related columns to point to public.users(id) instead of auth.users.
-- Ensures data integrity and consistent ownership resolution across the platform.

BEGIN;

-- Utility function to safely drop constraints and update foreign keys
-- Note: SQL-only migration for maximum compatibility.

--------------------------------------------------------------------------------
-- 1. JOBS TABLE
--------------------------------------------------------------------------------
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_created_by_fkey;

UPDATE public.jobs j
SET created_by = u.id
FROM public.users u
WHERE j.created_by::text = u.auth_user_id::text
AND j.created_by NOT IN (SELECT id FROM public.users);

ALTER TABLE public.jobs 
ADD CONSTRAINT jobs_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- 2. CODING INTERVIEWS & SUBMISSIONS
--------------------------------------------------------------------------------
-- Interviews
ALTER TABLE public.coding_interviews DROP CONSTRAINT IF EXISTS coding_interviews_created_by_fkey;
ALTER TABLE public.coding_interviews DROP CONSTRAINT IF EXISTS coding_interviews_identity_v4_fkey;

UPDATE public.coding_interviews ci
SET created_by = u.id
FROM public.users u
WHERE ci.created_by::text = u.auth_user_id::text
AND ci.created_by NOT IN (SELECT id FROM public.users);

ALTER TABLE public.coding_interviews 
ADD CONSTRAINT coding_interviews_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

-- Submissions (if created_by exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coding_submissions' AND column_name = 'created_by') THEN
        ALTER TABLE public.coding_submissions DROP CONSTRAINT IF EXISTS coding_submissions_created_by_fkey;
        
        UPDATE public.coding_submissions cs
        SET created_by = u.id
        FROM public.users u
        WHERE cs.created_by::text = u.auth_user_id::text
        AND cs.created_by NOT IN (SELECT id FROM public.users);

        ALTER TABLE public.coding_submissions 
        ADD CONSTRAINT coding_submissions_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 3. VOICE SCREENING (CAMPAIGNS & CANDIDATES)
--------------------------------------------------------------------------------
-- Campaigns
ALTER TABLE public.voice_screening_campaigns DROP CONSTRAINT IF EXISTS voice_screening_campaigns_created_by_fkey;

UPDATE public.voice_screening_campaigns vsc
SET created_by = u.id
FROM public.users u
WHERE vsc.created_by::text = u.auth_user_id::text
AND vsc.created_by NOT IN (SELECT id FROM public.users);

ALTER TABLE public.voice_screening_campaigns 
ADD CONSTRAINT voice_screening_campaigns_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

-- Candidates
ALTER TABLE public.voice_candidates DROP CONSTRAINT IF EXISTS voice_candidates_created_by_fkey;
ALTER TABLE public.voice_candidates DROP CONSTRAINT IF EXISTS voice_candidates_identity_v4_fkey;

UPDATE public.voice_candidates vc
SET created_by = u.id
FROM public.users u
WHERE vc.created_by::text = u.auth_user_id::text
AND vc.created_by NOT IN (SELECT id FROM public.users);

ALTER TABLE public.voice_candidates 
ADD CONSTRAINT voice_candidates_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- 5. TEST EVALUATION (BATCHES & RESULTS)
--------------------------------------------------------------------------------
-- Batches
ALTER TABLE public.test_evaluation_batches DROP CONSTRAINT IF EXISTS test_evaluation_batches_created_by_fkey;

UPDATE public.test_evaluation_batches teb
SET created_by = u.id
FROM public.users u
WHERE teb.created_by::text = u.auth_user_id::text
AND teb.created_by NOT IN (SELECT id FROM public.users);

ALTER TABLE public.test_evaluation_batches 
ADD CONSTRAINT test_evaluation_batches_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;

-- Results (if user_id or created_by exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'test_evaluation_results' AND column_name = 'user_id') THEN
        ALTER TABLE public.test_evaluation_results DROP CONSTRAINT IF EXISTS test_evaluation_results_user_id_fkey;
        
        UPDATE public.test_evaluation_results ter
        SET user_id = u.id
        FROM public.users u
        WHERE ter.user_id::text = u.auth_user_id::text
        AND ter.user_id NOT IN (SELECT id FROM public.users);

        ALTER TABLE public.test_evaluation_results 
        ADD CONSTRAINT test_evaluation_results_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'test_evaluation_results' AND column_name = 'created_by') THEN
        ALTER TABLE public.test_evaluation_results DROP CONSTRAINT IF EXISTS test_evaluation_results_created_by_fkey;
        
        UPDATE public.test_evaluation_results ter
        SET created_by = u.id
        FROM public.users u
        WHERE ter.created_by::text = u.auth_user_id::text
        AND ter.created_by NOT IN (SELECT id FROM public.users);

        ALTER TABLE public.test_evaluation_results 
        ADD CONSTRAINT test_evaluation_results_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
