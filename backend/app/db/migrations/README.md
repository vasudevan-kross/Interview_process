# Database Migrations

This directory contains SQL migration files for the Interview Management database.

## How to Apply Migrations

### For Supabase Users

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Create a new query
4. Copy the contents of the migration file you want to apply
5. Click **Run** to execute the migration

### Migration Files

- `001_initial_schema.sql` - Initial database schema with all tables
- `002_seed_roles.sql` - Insert default roles (admin, hr, interviewer)
- `003_auto_assign_role.sql` - Automatically assign 'hr' role to new users
- `004_add_metadata_columns.sql` - Adds missing metadata and file path columns
- `005_fix_total_marks_type.sql` - Fixes total_marks to support decimal values
- `006_make_domain_nullable.sql` - Makes domain column nullable
- `007_add_submitted_by_column.sql` - Adds submitted_by column to answer_sheets
- `008_make_legacy_answer_columns_nullable.sql` - **NEW** - Makes legacy columns nullable

## ⚠️ IMPORTANT: Apply Migrations in Order

If you haven't applied migrations 004-008 yet, you must apply them **in sequence**:

1. **First:** Apply `004_add_metadata_columns.sql`
2. **Second:** Apply `005_fix_total_marks_type.sql`
3. **Third:** Apply `006_make_domain_nullable.sql`
4. **Fourth:** Apply `007_add_submitted_by_column.sql`
5. **Fifth:** Apply `008_make_legacy_answer_columns_nullable.sql`

## Latest Migration (008)

This migration fixes the PostgreSQL error: `null value in column "file_path" of relation "answer_sheets" violates not-null constraint`

**Changes:**
- Makes `file_path` and `uploaded_by` columns nullable in `answer_sheets` table
- Code now uses `answer_sheet_path` and `submitted_by` instead
- Copies data from new columns to old columns for backward compatibility
- Marks old columns as legacy fields

**To apply:**
```sql
-- Copy and paste the contents of 008_make_legacy_answer_columns_nullable.sql into Supabase SQL Editor
```

## Migration 007

This migration fixes the PostgreSQL error: `Could not find the 'submitted_by' column of 'answer_sheets' in the schema cache`

**Changes:**
- Adds `submitted_by` column to `answer_sheets` table (UUID foreign key to users table)
- Tracks which user submitted the answer sheet
- Adds index for better query performance

**To apply:**
```sql
-- Copy and paste the contents of 007_add_submitted_by_column.sql into Supabase SQL Editor
```

## Migration 006

This migration fixes the PostgreSQL error: `null value in column "domain" of relation "tests" violates not-null constraint`

**Changes:**
- Makes `domain` column nullable in `tests` table (code now uses `test_type` instead)
- Updates existing records to copy `test_type` to `domain` if needed
- Marks `domain` as legacy field for backward compatibility

**To apply:**
```sql
-- Copy and paste the contents of 006_make_domain_nullable.sql into Supabase SQL Editor
```

## Migration 005

This migration fixes the PostgreSQL error: `invalid input syntax for type integer: "25.0"`

**Changes:**
- Changes `total_marks` column type from `INTEGER` to `DECIMAL(5,2)` in `tests` table
- Allows decimal values for total marks (e.g., 25.5 marks)

**To apply:**
```sql
-- Copy and paste the contents of 005_fix_total_marks_type.sql into Supabase SQL Editor
```

## Migration 004

This migration fixes the PostgREST error: "Could not find the 'metadata' column of 'tests' in the schema cache"

**Changes:**
- Adds `metadata`, `test_type`, `question_paper_path`, `question_paper_name` to `tests` table
- Adds `metadata` to `questions` table
- Adds `metadata`, `answer_sheet_path`, `answer_sheet_name`, `total_marks_obtained`, `submitted_at` to `answer_sheets` table
- Adds `feedback`, `key_points_covered`, `key_points_missed`, `evaluated_by_model`, `metadata` to `answer_evaluations` table
- Renames `awarded_marks` to `marks_awarded` in `answer_evaluations` for consistency
- Renames `total_score` to `total_marks_obtained` in `answer_sheets` for consistency

**To apply:**
```sql
-- Copy and paste the contents of 004_add_metadata_columns.sql into Supabase SQL Editor
```

## For Local PostgreSQL Users

If you're using a local PostgreSQL database:

```bash
psql -h localhost -U postgres -d interview_db -f backend/app/db/migrations/004_add_metadata_columns.sql
```

## Verification

After applying the migration, verify the changes:

```sql
-- Check tests table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tests';

-- Check questions table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'questions';

-- Check answer_sheets table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'answer_sheets';

-- Check answer_evaluations table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'answer_evaluations';
```

## Rollback

If you need to rollback this migration:

```sql
-- Remove added columns from tests
ALTER TABLE tests
    DROP COLUMN IF EXISTS test_type,
    DROP COLUMN IF EXISTS question_paper_path,
    DROP COLUMN IF EXISTS question_paper_name,
    DROP COLUMN IF EXISTS metadata;

-- Remove metadata from questions
ALTER TABLE questions DROP COLUMN IF EXISTS metadata;

-- Remove added columns from answer_sheets
ALTER TABLE answer_sheets
    DROP COLUMN IF EXISTS answer_sheet_path,
    DROP COLUMN IF EXISTS answer_sheet_name,
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS submitted_at;

-- Remove added columns from answer_evaluations
ALTER TABLE answer_evaluations
    DROP COLUMN IF EXISTS feedback,
    DROP COLUMN IF EXISTS key_points_covered,
    DROP COLUMN IF EXISTS key_points_missed,
    DROP COLUMN IF EXISTS evaluated_by_model,
    DROP COLUMN IF EXISTS metadata;

-- Rename columns back
ALTER TABLE answer_evaluations RENAME COLUMN marks_awarded TO awarded_marks;
ALTER TABLE answer_sheets RENAME COLUMN total_marks_obtained TO total_score;
```
