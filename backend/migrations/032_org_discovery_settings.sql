-- Migration 032: Organization Discovery Settings
-- Add domain-based discovery configuration to organizations

-- Add discovery settings to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allow_domain_join BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_join_domains TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_join_role TEXT DEFAULT 'viewer'
    CHECK (auto_join_role IN ('admin', 'hr', 'interviewer', 'viewer'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_domain_join
  ON organizations(allow_domain_join)
  WHERE allow_domain_join = TRUE;

-- Comments for documentation
COMMENT ON COLUMN organizations.allow_domain_join IS
  'Enable automatic joining for users with matching email domains';
COMMENT ON COLUMN organizations.auto_join_domains IS
  'Array of email domains that can auto-join (e.g., {acme.com, acme.io})';
COMMENT ON COLUMN organizations.auto_join_role IS
  'Default role assigned when users auto-join via domain match (viewer|interviewer|hr|admin)';
