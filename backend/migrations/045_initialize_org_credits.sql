-- ============================================================================
-- Migration 045: Initialize Organization Credits with Starter Bonus
-- ============================================================================
-- Description: Grants 1000 starter credits to all existing organizations
--              and creates initial transaction records.
-- Date: 2026-03-27
-- Prerequisites: Migration 044 must be run first
-- ============================================================================

-- ============================================================================
-- 1. Insert Credit Balance for All Existing Organizations
-- ============================================================================

INSERT INTO organization_credits (org_id, balance, total_purchased, total_consumed)
SELECT
    id,
    1000,  -- Initial bonus credits
    1000,  -- Count as "purchased" for accounting
    0      -- No consumption yet
FROM organizations
ON CONFLICT (org_id) DO NOTHING;  -- Skip if already exists

-- ============================================================================
-- 2. Create Transaction Records for Bonus Credits
-- ============================================================================

INSERT INTO credit_transactions (org_id, type, amount, balance_after, notes, feature, action)
SELECT
    id,
    'bonus',
    1000,
    1000,
    'Initial bonus credits - Welcome to the platform!',
    NULL,
    NULL
FROM organizations
WHERE NOT EXISTS (
    -- Don't duplicate if transaction already exists
    SELECT 1 FROM credit_transactions
    WHERE credit_transactions.org_id = organizations.id
    AND type = 'bonus'
);

-- ============================================================================
-- 3. Verification Query (for manual check)
-- ============================================================================
-- Run this separately to verify the migration worked:
--
-- SELECT
--     o.id,
--     o.name,
--     oc.balance,
--     oc.total_purchased,
--     COUNT(ct.id) as transaction_count
-- FROM organizations o
-- LEFT JOIN organization_credits oc ON o.id = oc.org_id
-- LEFT JOIN credit_transactions ct ON o.id = ct.org_id
-- GROUP BY o.id, o.name, oc.balance, oc.total_purchased
-- ORDER BY o.created_at DESC;

-- ============================================================================
-- End of Migration 045
-- ============================================================================
