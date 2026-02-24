-- Migration: Add missing metadata and file path columns to tests, questions, and answer_sheets tables
-- This fixes the PostgREST error: "Could not find the 'metadata' column in the schema cache"

-- Add missing columns to tests table
ALTER TABLE tests
    ADD COLUMN IF NOT EXISTS test_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS question_paper_path TEXT,
    ADD COLUMN IF NOT EXISTS question_paper_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Update test_type from domain for existing records
UPDATE tests SET test_type = domain WHERE test_type IS NULL;

-- Add metadata column to questions table
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add missing columns to answer_sheets table
-- First, handle the total_score/total_marks_obtained column
DO $$
BEGIN
    -- If total_score exists, rename it to total_marks_obtained
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'answer_sheets' AND column_name = 'total_score') THEN
        ALTER TABLE answer_sheets RENAME COLUMN total_score TO total_marks_obtained;
    -- If neither exists, add total_marks_obtained
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'answer_sheets' AND column_name = 'total_marks_obtained') THEN
        ALTER TABLE answer_sheets ADD COLUMN total_marks_obtained DECIMAL(5,2);
    END IF;
END$$;

-- Add other missing columns to answer_sheets
ALTER TABLE answer_sheets
    ADD COLUMN IF NOT EXISTS answer_sheet_path TEXT,
    ADD COLUMN IF NOT EXISTS answer_sheet_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tests_test_type ON tests(test_type);
CREATE INDEX IF NOT EXISTS idx_tests_question_paper_path ON tests(question_paper_path);

-- Add missing columns to answer_evaluations table
-- First, handle the awarded_marks/marks_awarded column
DO $$
BEGIN
    -- If awarded_marks exists, rename it to marks_awarded
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'answer_evaluations' AND column_name = 'awarded_marks') THEN
        ALTER TABLE answer_evaluations RENAME COLUMN awarded_marks TO marks_awarded;
    -- If neither exists, add marks_awarded
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'answer_evaluations' AND column_name = 'marks_awarded') THEN
        ALTER TABLE answer_evaluations ADD COLUMN marks_awarded DECIMAL(5,2);
    END IF;
END$$;

-- Add other missing columns to answer_evaluations
ALTER TABLE answer_evaluations
    ADD COLUMN IF NOT EXISTS feedback TEXT,
    ADD COLUMN IF NOT EXISTS key_points_covered JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS key_points_missed JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS evaluated_by_model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN tests.metadata IS 'Stores file metadata, extraction info, and model information';
COMMENT ON COLUMN questions.metadata IS 'Stores question difficulty, topics, and other attributes';
COMMENT ON COLUMN answer_sheets.metadata IS 'Stores file metadata and extraction information';
COMMENT ON COLUMN answer_evaluations.metadata IS 'Stores max_marks, question_number, and reasoning for evaluation';
