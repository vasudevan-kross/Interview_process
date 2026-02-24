-- Migration: Make legacy file_path and uploaded_by columns nullable in answer_sheets
-- The code now uses answer_sheet_path and submitted_by instead

-- Make legacy columns nullable
ALTER TABLE answer_sheets
    ALTER COLUMN file_path DROP NOT NULL,
    ALTER COLUMN uploaded_by DROP NOT NULL;

-- Copy data from new columns to old columns for backward compatibility
UPDATE answer_sheets
SET file_path = answer_sheet_path
WHERE file_path IS NULL AND answer_sheet_path IS NOT NULL;

UPDATE answer_sheets
SET uploaded_by = submitted_by
WHERE uploaded_by IS NULL AND submitted_by IS NOT NULL;

-- Add comments for clarification
COMMENT ON COLUMN answer_sheets.file_path IS 'Legacy field - use answer_sheet_path instead. Kept for backward compatibility.';
COMMENT ON COLUMN answer_sheets.uploaded_by IS 'Legacy field - use submitted_by instead. Kept for backward compatibility.';
