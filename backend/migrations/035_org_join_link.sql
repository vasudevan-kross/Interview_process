-- Migration 035: Organization Join Link
-- Add shareable join link functionality for organizations

-- Add join link columns to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS join_link_token VARCHAR(32),
  ADD COLUMN IF NOT EXISTS join_link_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS join_link_role VARCHAR(20) DEFAULT 'interviewer';

-- Create unique index on join_link_token for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_join_link_token
  ON organizations(join_link_token)
  WHERE join_link_token IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN organizations.join_link_token IS
  'Unique token for shareable join link. Anyone with this link can join the organization.';

COMMENT ON COLUMN organizations.join_link_enabled IS
  'Whether the join link is currently active. Owners can disable without changing the token.';

COMMENT ON COLUMN organizations.join_link_role IS
  'Default role assigned to members who join via the link (default: interviewer)';
