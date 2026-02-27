# User Role Setup Guide

## Problem
When users sign up, they're not automatically assigned a role, so the code shows `'user'` as a fallback. This is incorrect - the system should only have 3 roles:

1. **admin** - Full system access
2. **hr** - Manage jobs and resumes (default)
3. **interviewer** - Manage tests and evaluations

## Solution

### Step 1: Run Database Migrations

Execute these SQL migrations in your Supabase SQL Editor or via `psql`:

#### 1. Seed Roles (Run Once)
```bash
psql -h YOUR_SUPABASE_HOST -U postgres -d postgres -f backend/app/db/migrations/002_seed_roles.sql
```

Or in Supabase SQL Editor:
```sql
-- Copy and paste contents from:
-- backend/app/db/migrations/002_seed_roles.sql
```

This will:
- Create the 3 roles (admin, hr, interviewer)
- Assign HR role to all existing users who don't have a role

#### 2. Auto-Assign Role Trigger (Run Once)
```bash
psql -h YOUR_SUPABASE_HOST -U postgres -d postgres -f backend/app/db/migrations/003_auto_assign_role.sql
```

Or in Supabase SQL Editor:
```sql
-- Copy and paste contents from:
-- backend/app/db/migrations/003_auto_assign_role.sql
```

This creates a trigger that automatically assigns the HR role to new users when they sign up.

### Step 2: Verify Roles Setup

Check that roles exist:
```sql
SELECT * FROM roles;
```

You should see:
```
id                  | name        | description
--------------------|-------------|------------------------------------------
uuid-1              | admin       | System administrator with full access
uuid-2              | hr          | HR personnel who manage job descriptions...
uuid-3              | interviewer | Interviewer who creates and evaluates tests
```

Check that users have roles:
```sql
SELECT
    u.email,
    r.name as role
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id;
```

### Step 3: Manually Assign Admin Role

For the first admin user, you need to manually assign the admin role:

```sql
-- Get your user ID
SELECT id, email FROM users WHERE email = 'your-email@example.com';

-- Get admin role ID
SELECT id FROM roles WHERE name = 'admin';

-- Assign admin role
INSERT INTO user_roles (user_id, role_id)
VALUES (
    (SELECT id FROM users WHERE email = 'your-email@example.com'),
    (SELECT id FROM roles WHERE name = 'admin')
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Verify
SELECT
    u.email,
    r.name as role
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'your-email@example.com';
```

### Step 4: Update Frontend Code

Use the new auth utility instead of inline role checks:

**Before:**
```typescript
const { data: roleData } = await supabase
  .from('user_roles')
  .select('roles(name)')
  .eq('user_id', userRecord.id)
  .single()

const role = (roleData as any)?.roles?.name || 'user'  // ❌
```

**After:**
```typescript
import { getUserRole, isAdmin } from '@/lib/utils/auth'

const role = await getUserRole()  // ✅ Returns 'admin' | 'hr' | 'interviewer'
const adminAccess = await isAdmin()  // ✅ Returns boolean
```

## Testing

### Test New User Signup

1. Sign up a new user
2. Check the database:
   ```sql
   SELECT
       u.email,
       r.name as role,
       ur.assigned_at
   FROM users u
   JOIN user_roles ur ON u.id = ur.user_id
   JOIN roles r ON ur.role_id = r.id
   WHERE u.email = 'new-user@example.com';
   ```
3. Should show role = 'hr' (default)

### Test Role-Based Access

1. **Admin User:**
   - Can see Analytics (system-wide data)
   - Can see Settings > LLM Models tab
   - Can see Settings > User Management tab

2. **HR User:**
   - Can see Analytics (own data only)
   - Can see Settings > Profile and Preferences
   - Cannot see admin tabs

3. **Interviewer User:**
   - Can see Analytics (own tests only)
   - Can see Settings > Profile and Preferences
   - Cannot see admin tabs

## Troubleshooting

### User has no role assigned

If a user still has no role:
```sql
-- Manually assign HR role
INSERT INTO user_roles (user_id, role_id)
VALUES (
    (SELECT id FROM users WHERE email = 'user@example.com'),
    (SELECT id FROM roles WHERE name = 'hr')
);
```

### Trigger not working

Check if trigger exists:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'trigger_auto_assign_role';
```

If not, run migration 003 again.

### Multiple roles assigned

Users should only have ONE role:
```sql
-- Check for users with multiple roles
SELECT user_id, COUNT(*) as role_count
FROM user_roles
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Remove duplicate roles (keep the first one)
DELETE FROM user_roles
WHERE id NOT IN (
    SELECT MIN(id)
    FROM user_roles
    GROUP BY user_id
);
```

## Role Permissions Reference

### Admin
- Full system access
- Can view all jobs, resumes, tests, answers
- Can manage users and assign roles
- Can configure LLM models
- Can view system-wide analytics

### HR (Default)
- Can create and manage job descriptions
- Can upload and view resumes
- Can view candidates for their jobs
- Can view analytics for their jobs only
- Cannot access admin settings

### Interviewer
- Can create and manage tests
- Can upload and evaluate answer sheets
- Can view results for their tests
- Can view analytics for their tests only
- Cannot access admin settings

## Default Role Change

To change the default role from 'hr' to something else:

```sql
-- Edit the trigger function
CREATE OR REPLACE FUNCTION auto_assign_hr_role()
RETURNS TRIGGER AS $$
DECLARE
    default_role_id UUID;
BEGIN
    -- Change 'hr' to 'interviewer' or 'admin' as needed
    SELECT id INTO default_role_id FROM roles WHERE name = 'interviewer';

    IF default_role_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id, assigned_at)
        VALUES (NEW.id, default_role_id, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Summary

✅ Only 3 roles: admin, hr, interviewer
✅ No 'user' role in database
✅ New users auto-assigned 'hr' role
✅ Trigger ensures all users have a role
✅ Utility functions for role checks
✅ Role-based access control throughout the app

The `'user'` you saw was just a fallback in the code - it's not a real role and won't appear anymore after applying these migrations.
