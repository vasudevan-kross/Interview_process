-- Migration: Fix total_marks data type to support decimal values
-- Changes total_marks from INTEGER to DECIMAL(5,2) to support partial marks

-- Change total_marks type in tests table
ALTER TABLE tests
    ALTER COLUMN total_marks TYPE DECIMAL(5,2);

-- Add comment for clarification
COMMENT ON COLUMN tests.total_marks IS 'Total marks for the test (supports decimal values like 25.5)';
