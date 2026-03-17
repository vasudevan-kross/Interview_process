-- Migration: Fix Coding Answers Evaluator Foreign Key
-- Description: Aligns coding_answers.evaluator_id to point to public.users(id) instead of auth.users
--              to resolve foreign key constraint errors (23503) when saving notes.

BEGIN;

-- 1. Drop existing constraint if it exists
-- The original name from 010 was likely automatic, but we'll try common names
ALTER TABLE public.coding_answers DROP CONSTRAINT IF EXISTS coding_answers_evaluator_id_fkey;

-- 2. Update existing data if any (optional safety)
-- If there are any evaluator_ids that are actually auth_user_ids, migrate them
UPDATE public.coding_answers ca
SET evaluator_id = u.id
FROM public.users u
WHERE ca.evaluator_id::text = u.auth_user_id::text
AND ca.evaluator_id NOT IN (SELECT id FROM public.users);

-- 3. Add the explicit foreign key to public.users(id)
ALTER TABLE public.coding_answers
ADD CONSTRAINT coding_answers_evaluator_id_fkey
FOREIGN KEY (evaluator_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
