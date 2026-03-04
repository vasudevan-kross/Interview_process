-- Migration: Add bond/terms and signature fields to coding_interviews and submissions
-- Created: 2026-03-03

-- Add bond terms fields to coding_interviews table
ALTER TABLE coding_interviews
ADD COLUMN IF NOT EXISTS bond_terms TEXT,
ADD COLUMN IF NOT EXISTS bond_document_url TEXT,
ADD COLUMN IF NOT EXISTS require_signature BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bond_years INTEGER DEFAULT 2;

-- Add signature fields to coding_submissions table
ALTER TABLE coding_submissions
ADD COLUMN IF NOT EXISTS signature_data TEXT,
ADD COLUMN IF NOT EXISTS signature_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS terms_ip_address TEXT;

-- Add comment
COMMENT ON COLUMN coding_interviews.bond_terms IS 'Terms and conditions text for bond agreement';
COMMENT ON COLUMN coding_interviews.bond_document_url IS 'URL to uploaded bond document (Word/PDF)';
COMMENT ON COLUMN coding_interviews.require_signature IS 'Whether candidate must sign bond terms';
COMMENT ON COLUMN coding_interviews.bond_years IS 'Number of years for bond agreement';
COMMENT ON COLUMN coding_submissions.signature_data IS 'Base64 encoded signature image data';
COMMENT ON COLUMN coding_submissions.signature_accepted_at IS 'Timestamp when signature was provided';
COMMENT ON COLUMN coding_submissions.terms_ip_address IS 'IP address from which terms were accepted';
