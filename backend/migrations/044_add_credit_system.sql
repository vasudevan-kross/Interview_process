-- ============================================================================
-- Migration 044: Credit System for Organization-Level Billing
-- ============================================================================
-- Description: Adds credit-based billing system for Resume Matching,
--              Coding Interviews, and Voice Screening features.
-- Date: 2026-03-27
-- ============================================================================

-- ============================================================================
-- 1. Organization Credit Balance
-- ============================================================================
-- Stores the current credit balance for each organization (single row per org)

CREATE TABLE IF NOT EXISTS organization_credits (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    total_purchased INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT positive_balance CHECK (balance >= 0)
);

-- Index for fast balance lookups
CREATE INDEX idx_org_credits_balance ON organization_credits(org_id, balance);

-- Trigger to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_org_credits_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_credits_update_timestamp
    BEFORE UPDATE ON organization_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_org_credits_timestamp();

-- ============================================================================
-- 2. Credit Transactions (Audit Log)
-- ============================================================================
-- Records all credit purchases, deductions, and refunds

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'deduction', 'refund', 'bonus')),
    amount INTEGER NOT NULL, -- positive for purchase/refund/bonus, negative for deduction
    balance_after INTEGER NOT NULL,

    -- Feature/action tracking
    feature TEXT, -- 'resume_matching', 'coding_interview', 'voice_screening'
    action TEXT, -- 'upload', 'generation', 'call', 'summary', etc.
    reference_id UUID, -- links to resume_id, submission_id, call_id, etc.
    notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_credit_transactions_org_date ON credit_transactions(org_id, created_at DESC);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX idx_credit_transactions_feature ON credit_transactions(feature);
CREATE INDEX idx_credit_transactions_reference ON credit_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================================
-- 3. Credit Holds (For Refundable Operations)
-- ============================================================================
-- Manages temporary credit holds (primarily for voice calls with variable duration)

CREATE TABLE IF NOT EXISTS credit_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    feature TEXT NOT NULL, -- 'voice_screening'
    reference_id UUID NOT NULL, -- voice_candidates.id, call_history.id, etc.
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'captured', 'refunded', 'expired')),

    -- Transaction link (created when captured/refunded)
    transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ -- optional expiry for holds
);

-- Indexes for hold management
CREATE INDEX idx_credit_holds_org ON credit_holds(org_id);
CREATE INDEX idx_credit_holds_status ON credit_holds(status) WHERE status = 'pending';
CREATE INDEX idx_credit_holds_reference ON credit_holds(reference_id);

-- Trigger to set resolved_at when status changes from pending
CREATE OR REPLACE FUNCTION set_hold_resolved_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != 'pending' AND OLD.status = 'pending' THEN
        NEW.resolved_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_holds_resolve_timestamp
    BEFORE UPDATE ON credit_holds
    FOR EACH ROW
    EXECUTE FUNCTION set_hold_resolved_timestamp();

-- ============================================================================
-- 4. Helper Functions
-- ============================================================================

-- Function to get organization credit balance
CREATE OR REPLACE FUNCTION get_org_credit_balance(p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT balance INTO v_balance
    FROM organization_credits
    WHERE org_id = p_org_id;

    -- Return 0 if no record exists
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check if org has sufficient credits
CREATE OR REPLACE FUNCTION has_sufficient_credits(p_org_id UUID, p_required INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_org_credit_balance(p_org_id) >= p_required;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. RLS Policies (Row Level Security)
-- ============================================================================

-- Enable RLS on all credit tables
ALTER TABLE organization_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_holds ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view credits for their own organization
CREATE POLICY org_credits_select_policy ON organization_credits
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Only service role can modify credit balances
CREATE POLICY org_credits_modify_policy ON organization_credits
    FOR ALL
    USING (auth.role() = 'service_role');

-- Policy: Users can view transactions for their organization
CREATE POLICY credit_transactions_select_policy ON credit_transactions
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Only service role can insert transactions
CREATE POLICY credit_transactions_insert_policy ON credit_transactions
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Policy: Users can view holds for their organization
CREATE POLICY credit_holds_select_policy ON credit_holds
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Only service role can manage holds
CREATE POLICY credit_holds_modify_policy ON credit_holds
    FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================================
-- 6. Comments for Documentation
-- ============================================================================

COMMENT ON TABLE organization_credits IS 'Stores credit balance for each organization';
COMMENT ON TABLE credit_transactions IS 'Audit log of all credit purchases, deductions, and refunds';
COMMENT ON TABLE credit_holds IS 'Temporary holds for variable-cost operations (e.g., voice calls)';

COMMENT ON COLUMN credit_transactions.type IS 'Transaction type: purchase, deduction, refund, bonus';
COMMENT ON COLUMN credit_transactions.amount IS 'Credit amount: positive for purchase/refund, negative for deduction';
COMMENT ON COLUMN credit_transactions.feature IS 'Feature that consumed credits: resume_matching, coding_interview, voice_screening';
COMMENT ON COLUMN credit_transactions.action IS 'Specific action: upload, generation, call, summary, etc.';
COMMENT ON COLUMN credit_transactions.reference_id IS 'Foreign key to relevant entity (resume_id, submission_id, etc.)';

COMMENT ON COLUMN credit_holds.status IS 'Hold status: pending (active), captured (charged), refunded (cancelled), expired';
COMMENT ON COLUMN credit_holds.reference_id IS 'Reference to the resource being held for (voice call, etc.)';

-- ============================================================================
-- End of Migration 044
-- ============================================================================
