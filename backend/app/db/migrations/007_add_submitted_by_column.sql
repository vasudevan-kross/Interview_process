-- Migration: Add submitted_by column to answer_sheets table
-- The code tracks which user submitted the answer sheet

-- Add submitted_by column to answer_sheets table
ALTER TABLE answer_sheets
    ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_answer_sheets_submitted_by ON answer_sheets(submitted_by);

-- Add comment for documentation
COMMENT ON COLUMN answer_sheets.submitted_by IS 'User who submitted this answer sheet (FK to users table)';
