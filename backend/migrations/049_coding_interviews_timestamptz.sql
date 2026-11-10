-- ============================================================================
-- Migration 049: Convert coding interview timestamps to TIMESTAMPTZ
-- ============================================================================
-- Problem: these columns were TIMESTAMP WITHOUT TIME ZONE. Postgres silently
-- dropped the "+05:30" offset the frontend sends, so the backend (running in
-- UTC on Render) compared IST wall-clock values against UTC "now" and told
-- candidates "Interview has not started yet" for 5.5 hours after the start.
--
-- Existing data is converted according to who wrote it:
--   * Recruiter-scheduled values (scheduled_*, link_expires_at) hold IST
--     wall-clock time  -> interpreted as Asia/Kolkata.
--   * coding_answers.evaluated_at is written by the LOCAL evaluation backend
--     (IST clock) -> interpreted as Asia/Kolkata.
--   * Server-written values (started_at, submitted_at, NOW()
--     defaults, ...) were written with the UTC server clock -> interpreted as UTC.
--
-- Run this BEFORE deploying the matching backend change (time_utils.now_app).
-- Safe to re-run: each column is only converted while it is still TIMESTAMP.
-- ============================================================================

DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN
        SELECT * FROM (VALUES
            ('coding_interviews',  'scheduled_start_time',  'Asia/Kolkata'),
            ('coding_interviews',  'scheduled_end_time',    'Asia/Kolkata'),
            ('coding_interviews',  'link_expires_at',       'Asia/Kolkata'),
            ('coding_interviews',  'started_at',            'UTC'),
            ('coding_interviews',  'completed_at',          'UTC'),
            ('coding_interviews',  'created_at',            'UTC'),
            ('coding_interviews',  'updated_at',            'UTC'),
            ('coding_submissions', 'started_at',            'UTC'),
            ('coding_submissions', 'submitted_at',          'UTC'),
            ('coding_submissions', 'resume_uploaded_at',    'UTC'),
            ('coding_submissions', 'signature_accepted_at', 'UTC'),
            ('coding_submissions', 'created_at',            'UTC'),
            ('coding_answers',     'evaluated_at',          'Asia/Kolkata'),
            ('coding_answers',     'created_at',            'UTC'),
            ('coding_answers',     'updated_at',            'UTC')
        ) AS t(tbl, colname, tz)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = col.tbl
              AND column_name = col.colname
              AND data_type = 'timestamp without time zone'
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE %L',
                col.tbl, col.colname, col.colname, col.tz
            );
            RAISE NOTICE 'Converted %.% to TIMESTAMPTZ (from %)', col.tbl, col.colname, col.tz;
        END IF;
    END LOOP;
END $$;
