-- Fix: session_activities.question_id FK missing ON DELETE CASCADE
-- This prevents deleting interviews that have session activity records

-- Drop the existing constraint (without CASCADE)
ALTER TABLE session_activities
DROP CONSTRAINT IF EXISTS session_activities_question_id_fkey;

-- Re-add with ON DELETE SET NULL so activities are preserved but question ref is cleared
ALTER TABLE session_activities
ADD CONSTRAINT session_activities_question_id_fkey
FOREIGN KEY (question_id) REFERENCES coding_questions(id) ON DELETE SET NULL;
