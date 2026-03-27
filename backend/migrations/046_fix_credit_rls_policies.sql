-- ============================================================================
-- Migration 046: Fix Credit System RLS Policies
-- ============================================================================
-- Description: Updates RLS policies to work correctly with organization context
--              The policies need to check against users table, not auth.users
-- Date: 2026-03-27
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS org_credits_select_policy ON organization_credits;
DROP POLICY IF EXISTS org_credits_modify_policy ON organization_credits;
DROP POLICY IF EXISTS credit_transactions_select_policy ON credit_transactions;
DROP POLICY IF EXISTS credit_transactions_insert_policy ON credit_transactions;
DROP POLICY IF EXISTS credit_holds_select_policy ON credit_holds;
DROP POLICY IF EXISTS credit_holds_modify_policy ON credit_holds;

-- ============================================================================
-- NEW POLICIES: Use users table instead of auth.users
-- ============================================================================

-- Organization Credits Policies
CREATE POLICY org_credits_select_policy ON organization_credits
    FOR SELECT
    USING (
        -- Allow if user is a member of the organization
        org_id IN (
            SELECT om.org_id
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_user_id = auth.uid()
        )
        OR
        -- Allow service role (backend API)
        auth.role() = 'service_role'
    );

CREATE POLICY org_credits_modify_policy ON organization_credits
    FOR ALL
    USING (auth.role() = 'service_role');

-- Credit Transactions Policies
CREATE POLICY credit_transactions_select_policy ON credit_transactions
    FOR SELECT
    USING (
        -- Allow if user is a member of the organization
        org_id IN (
            SELECT om.org_id
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_user_id = auth.uid()
        )
        OR
        -- Allow service role (backend API)
        auth.role() = 'service_role'
    );

CREATE POLICY credit_transactions_insert_policy ON credit_transactions
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Credit Holds Policies
CREATE POLICY credit_holds_select_policy ON credit_holds
    FOR SELECT
    USING (
        -- Allow if user is a member of the organization
        org_id IN (
            SELECT om.org_id
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE u.auth_user_id = auth.uid()
        )
        OR
        -- Allow service role (backend API)
        auth.role() = 'service_role'
    );

CREATE POLICY credit_holds_modify_policy ON credit_holds
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- Verify Policies
-- ============================================================================
-- You can verify the policies are working by running:
-- SELECT * FROM organization_credits WHERE org_id = '<your-org-id>';
-- (This should return data if you are a member of that organization)

-- ============================================================================
-- End of Migration 046
-- ============================================================================
