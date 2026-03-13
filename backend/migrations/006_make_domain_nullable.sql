-- Migration: Make domain column nullable
-- The code now uses test_type instead of domain, so domain can be null

-- Make domain column nullable
ALTER TABLE tests
    ALTER COLUMN domain DROP NOT NULL;

-- Update existing records to copy test_type to domain if domain is null
UPDATE tests
SET domain = test_type
WHERE domain IS NULL AND test_type IS NOT NULL;

-- Add comment for clarification
COMMENT ON COLUMN tests.domain IS 'Legacy field - use test_type instead. Kept for backward compatibility.';
