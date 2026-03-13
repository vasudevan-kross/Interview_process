-- Migration: Fix coding_interviews.created_by foreign key
-- Description: Change FK from users(id) to auth.users(id) since the system
--              uses Supabase auth UIDs directly (not the public users table IDs)
-- Date: 2026-02-26

-- Drop the existing FK constraint
ALTER TABLE coding_interviews
DROP CONSTRAINT IF EXISTS coding_interviews_created_by_fkey;

-- Also drop the evaluator FK in coding_answers (same issue)
ALTER TABLE coding_answers
DROP CONSTRAINT IF EXISTS coding_answers_evaluator_id_fkey;

-- Re-add FK referencing auth.users instead of public.users
ALTER TABLE coding_interviews
ADD CONSTRAINT coding_interviews_created_by_fkey
FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- Re-add evaluator FK referencing auth.users
ALTER TABLE coding_answers
ADD CONSTRAINT coding_answers_evaluator_id_fkey
FOREIGN KEY (evaluator_id) REFERENCES auth.users(id);

-- Verify
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE conname LIKE 'coding_%_fkey';
