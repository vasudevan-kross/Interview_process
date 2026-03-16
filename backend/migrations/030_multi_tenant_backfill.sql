-- Migration 030: Backfill existing data with auto-created organizations
-- For each existing user, create a personal org and assign all their data to it.
-- After backfill, set org_id columns to NOT NULL.

-- Step 1: Create personal organizations for each existing user
DO $$
DECLARE
  u RECORD;
  new_org_id UUID;
  user_name TEXT;
  org_slug TEXT;
BEGIN
  FOR u IN SELECT id, full_name, email FROM users LOOP
    -- Generate org name from user's full name or email
    user_name := COALESCE(NULLIF(u.full_name, ''), SPLIT_PART(u.email, '@', 1));
    org_slug := LOWER(REGEXP_REPLACE(user_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || SUBSTRING(u.id::TEXT, 1, 8);

    -- Create the organization
    INSERT INTO organizations (name, slug, plan)
    VALUES (user_name || '''s Workspace', org_slug, 'free')
    RETURNING id INTO new_org_id;

    -- Add user as owner
    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (new_org_id, u.id, 'owner');

    -- Backfill org_id on all user's data
    UPDATE job_descriptions SET org_id = new_org_id WHERE created_by = u.id AND org_id IS NULL;
    UPDATE resumes SET org_id = new_org_id WHERE uploaded_by = u.id AND org_id IS NULL;
    UPDATE tests SET org_id = new_org_id WHERE created_by = u.id AND org_id IS NULL;
    UPDATE answer_sheets SET org_id = new_org_id WHERE uploaded_by = u.id AND org_id IS NULL;
    UPDATE coding_interviews SET org_id = new_org_id WHERE created_by = u.id AND org_id IS NULL;
    UPDATE voice_screening_campaigns SET org_id = new_org_id WHERE created_by = u.id AND org_id IS NULL;
    UPDATE voice_candidates SET org_id = new_org_id WHERE created_by = u.id AND org_id IS NULL;
    UPDATE pipeline_candidates SET org_id = new_org_id WHERE created_by = u.id AND org_id IS NULL;

    RAISE NOTICE 'Created org "%" for user %', user_name || '''s Workspace', u.id;
  END LOOP;
END $$;

-- Step 2: Set org_id to NOT NULL on all tables (after backfill)
-- Only do this if all rows have been backfilled
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  -- Check for any remaining nulls
  SELECT COUNT(*) INTO null_count FROM job_descriptions WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE job_descriptions ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% job_descriptions still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM resumes WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE resumes ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% resumes still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM tests WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE tests ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% tests still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM answer_sheets WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE answer_sheets ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% answer_sheets still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM coding_interviews WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE coding_interviews ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% coding_interviews still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM voice_screening_campaigns WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE voice_screening_campaigns ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% voice_screening_campaigns still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM voice_candidates WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE voice_candidates ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% voice_candidates still have NULL org_id', null_count;
  END IF;

  SELECT COUNT(*) INTO null_count FROM pipeline_candidates WHERE org_id IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE pipeline_candidates ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE WARNING '% pipeline_candidates still have NULL org_id', null_count;
  END IF;
END $$;
