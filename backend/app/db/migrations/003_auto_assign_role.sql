-- Auto-assign HR role to new users
-- This trigger runs whenever a new user is created

CREATE OR REPLACE FUNCTION auto_assign_hr_role()
RETURNS TRIGGER AS $$
DECLARE
    hr_role_id UUID;
BEGIN
    -- Get the HR role ID
    SELECT id INTO hr_role_id FROM roles WHERE name = 'hr';

    -- Assign HR role to the new user
    IF hr_role_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id, assigned_at)
        VALUES (NEW.id, hr_role_id, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires after user insert
DROP TRIGGER IF EXISTS trigger_auto_assign_role ON users;
CREATE TRIGGER trigger_auto_assign_role
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_hr_role();
