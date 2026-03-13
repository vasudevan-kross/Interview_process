-- Seed default roles
-- Run this once to populate the roles table

-- Insert the three system roles
INSERT INTO roles (name, description, permissions) VALUES
    ('admin', 'System administrator with full access', '["user_manage", "system_settings", "view_all_data", "manage_models"]'::jsonb),
    ('hr', 'HR personnel who manage job descriptions and resumes', '["create_jobs", "view_own_jobs", "upload_resumes", "view_candidates"]'::jsonb),
    ('interviewer', 'Interviewer who creates and evaluates tests', '["create_tests", "view_own_tests", "upload_answers", "view_results"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Get the role IDs
DO $$
DECLARE
    hr_role_id UUID;
BEGIN
    -- Get HR role ID
    SELECT id INTO hr_role_id FROM roles WHERE name = 'hr';

    -- Assign HR role to all existing users who don't have a role
    INSERT INTO user_roles (user_id, role_id)
    SELECT u.id, hr_role_id
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
    );
END $$;
