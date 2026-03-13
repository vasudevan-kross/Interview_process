-- Migration: Voice Screening Campaigns
-- Description: Add campaign-based dynamic VAPI configuration support
-- Date: 2026-03-02

-- Create voice screening campaigns table
CREATE TABLE IF NOT EXISTS voice_screening_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Campaign metadata
    name TEXT NOT NULL,
    job_role TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,

    -- User-provided configuration
    custom_questions TEXT[] DEFAULT '{}', -- Array of custom questions
    required_fields TEXT[] DEFAULT '{}', -- Fields to extract (e.g., ["email", "phone", "experience"])
    interview_persona TEXT DEFAULT 'professional' CHECK (interview_persona IN ('professional', 'casual', 'technical')),
    candidate_type TEXT DEFAULT 'general' CHECK (candidate_type IN ('fresher', 'experienced', 'general')),

    -- AI-generated configuration
    generated_system_prompt TEXT NOT NULL,
    generated_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    vapi_config JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Model tracking
    generation_model TEXT,
    generation_metadata JSONB DEFAULT '{}'::jsonb
);

-- Add campaign_id to voice_candidates (NULLABLE for backward compatibility)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'voice_candidates'
        AND column_name = 'campaign_id'
    ) THEN
        ALTER TABLE voice_candidates
        ADD COLUMN campaign_id UUID REFERENCES voice_screening_campaigns(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_voice_candidates_campaign
ON voice_candidates(campaign_id)
WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_active
ON voice_screening_campaigns(is_active, created_by);

CREATE INDEX IF NOT EXISTS idx_campaigns_created_by
ON voice_screening_campaigns(created_by);

-- Enable Row Level Security
ALTER TABLE voice_screening_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own campaigns
CREATE POLICY voice_campaigns_select_own
ON voice_screening_campaigns
FOR SELECT
USING (auth.uid() = created_by);

-- RLS Policy: Users can insert their own campaigns
CREATE POLICY voice_campaigns_insert_own
ON voice_screening_campaigns
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- RLS Policy: Users can update their own campaigns
CREATE POLICY voice_campaigns_update_own
ON voice_screening_campaigns
FOR UPDATE
USING (auth.uid() = created_by);

-- RLS Policy: Users can delete their own campaigns
CREATE POLICY voice_campaigns_delete_own
ON voice_screening_campaigns
FOR DELETE
USING (auth.uid() = created_by);

-- Add comment explaining backward compatibility
COMMENT ON COLUMN voice_candidates.campaign_id IS 'NULLABLE for backward compatibility. NULL = uses static VAPI_ASSISTANT_ID, NOT NULL = uses campaign dynamic config';
COMMENT ON TABLE voice_screening_campaigns IS 'Stores AI-generated VAPI configurations for voice screening campaigns. Each campaign has Ollama-generated system prompts and structured data schemas.';
