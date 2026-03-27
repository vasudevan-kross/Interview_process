-- ============================================================================
-- CONSOLIDATED MIGRATION SCHEMA
-- ============================================================================
-- Description: Complete schema consolidation from migrations 001-042
-- Date: 2026-03-25
-- Note: This file represents the final state after all migrations.
--       Video interview tables (009) excluded per migration 036.
--       Migrations 038 (batch system) and 039 (remove batch) cancel out - excluded.
--       Migrations 037 (coding FK fix), 040 (pipeline org_id), 041 (campaigns) included.
--       Migration 042 fixes candidates summary return type.
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- For pgvector support

-- ============================================================================
-- SECTION 2: CORE USER MANAGEMENT
-- ============================================================================

-- Users table (linked to Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Supabase Auth links this to auth.users
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-Role mapping (many-to-many)
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    UNIQUE(user_id, role_id)
);

-- ============================================================================
-- SECTION 3: MULTI-TENANT ORGANIZATIONS
-- ============================================================================

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    settings JSONB DEFAULT '{}',

    -- Discovery & join settings
    allow_domain_join BOOLEAN DEFAULT FALSE,
    auto_join_domains TEXT[] DEFAULT '{}',
    auto_join_role TEXT DEFAULT 'viewer'
        CHECK (auto_join_role IN ('admin', 'hr', 'interviewer', 'viewer')),

    -- Join link settings
    join_link_token VARCHAR(32),
    join_link_enabled BOOLEAN DEFAULT FALSE,
    join_link_role VARCHAR(20) DEFAULT 'interviewer',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members (junction table)
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('owner', 'admin', 'hr', 'interviewer', 'viewer')),
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- Organization invitations
CREATE TABLE organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'hr', 'interviewer', 'viewer')),
    token TEXT UNIQUE NOT NULL,
    invited_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, email)
);

-- ============================================================================
-- SECTION 4: RESUME MATCHING
-- ============================================================================

-- Job Descriptions
CREATE TABLE job_descriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    experience_required VARCHAR(50),

    -- Document info
    file_path TEXT NOT NULL,
    file_type VARCHAR(20),
    file_size INTEGER,

    -- Parsed content
    description TEXT,
    raw_text TEXT,
    parsed_data JSONB,

    -- Vector embedding (pgvector - 768 dimensions for all-MiniLM-L6-v2)
    embedding vector(768),

    -- Pipeline settings
    pipeline_settings JSONB DEFAULT '{
        "highly_recommended_threshold": 85,
        "recommended_threshold": 65
    }'::jsonb,

    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active',
    deleted_at TIMESTAMPTZ DEFAULT NULL,

    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(raw_text, ''))
    ) STORED
);

-- Resumes
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    job_description_id UUID NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,

    -- Candidate info (extracted)
    candidate_name VARCHAR(255),
    candidate_email VARCHAR(255),
    candidate_phone VARCHAR(50),

    -- Document info
    file_path TEXT NOT NULL,
    file_type VARCHAR(20),
    file_size INTEGER,

    -- Parsed content
    raw_text TEXT,
    parsed_data JSONB,

    -- Vector embedding
    embedding vector(768),

    -- Matching results
    match_score DECIMAL(5,2),
    skill_match JSONB,
    experience_match JSONB,
    llm_analysis TEXT,

    -- Metadata
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending',

    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(candidate_name, '') || ' ' ||
            coalesce(candidate_email, '') || ' ' ||
            coalesce(raw_text, '')
        )
    ) STORED
);

-- ============================================================================
-- SECTION 5: TEST EVALUATION SYSTEM
-- ============================================================================

-- Tests
CREATE TABLE tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    title VARCHAR(255) NOT NULL,
    domain VARCHAR(100),
    test_type VARCHAR(100),
    description TEXT,
    duration_minutes INTEGER,
    total_marks DECIMAL(5,2),

    -- Document info
    question_paper_path TEXT,
    question_paper_name VARCHAR(255),

    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft',
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Questions (extracted from question papers)
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Question content
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),
    marks INTEGER NOT NULL,

    -- For MCQ
    options JSONB,
    correct_answer TEXT,

    -- Document info (if question is image-based)
    image_path TEXT,

    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(test_id, question_number)
);

-- Answer Sheets
CREATE TABLE answer_sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Candidate info
    candidate_name VARCHAR(255),
    candidate_email VARCHAR(255),
    candidate_id VARCHAR(100),

    -- Document info
    file_path TEXT,
    file_type VARCHAR(20),
    file_size INTEGER,
    answer_sheet_path TEXT,
    answer_sheet_name VARCHAR(255),

    -- Parsed content
    raw_text TEXT,
    parsed_answers JSONB,

    -- Evaluation results
    total_marks_obtained DECIMAL(5,2),
    max_score INTEGER,
    percentage DECIMAL(5,2),
    question_scores JSONB,
    llm_feedback TEXT,

    -- Metadata
    uploaded_by UUID REFERENCES users(id),
    submitted_by UUID REFERENCES users(id),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    evaluated_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending'
);

-- Individual Answer Evaluations
CREATE TABLE answer_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_sheet_id UUID NOT NULL REFERENCES answer_sheets(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

    candidate_answer TEXT,
    marks_awarded DECIMAL(5,2),
    max_marks INTEGER,

    -- LLM evaluation
    is_correct BOOLEAN,
    similarity_score DECIMAL(5,2),
    llm_reasoning TEXT,
    feedback TEXT,
    key_points_covered JSONB DEFAULT '[]'::jsonb,
    key_points_missed JSONB DEFAULT '[]'::jsonb,
    evaluated_by_model VARCHAR(100),

    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(answer_sheet_id, question_id)
);

-- ============================================================================
-- SECTION 6: CODING INTERVIEWS
-- ============================================================================

-- Coding Interviews (Main interview record)
CREATE TABLE coding_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    job_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Scheduling
    scheduled_start_time TIMESTAMP NOT NULL,
    scheduled_end_time TIMESTAMP NOT NULL,
    grace_period_minutes INTEGER DEFAULT 15,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'scheduled',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Link generation
    access_token VARCHAR(255) UNIQUE NOT NULL,
    link_expires_at TIMESTAMP NOT NULL,

    -- Interview type
    interview_type VARCHAR(50) DEFAULT 'coding',

    -- Configuration
    programming_language VARCHAR(50) DEFAULT 'python',
    allowed_languages VARCHAR(50)[] DEFAULT ARRAY['python'],
    total_marks INTEGER,

    -- Resume upload config
    resume_required VARCHAR(20) DEFAULT 'mandatory',

    -- Bond/terms configuration
    bond_terms TEXT,
    bond_document_url TEXT,
    require_signature BOOLEAN DEFAULT FALSE,
    bond_years INTEGER DEFAULT 2,
    bond_timing VARCHAR(20) DEFAULT 'before_submission',

    -- Metadata
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    metadata JSONB
);

-- Coding Questions
CREATE TABLE coding_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES coding_interviews(id) ON DELETE CASCADE NOT NULL,
    question_number INTEGER NOT NULL,

    -- Question content
    question_text TEXT NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'medium',
    marks INTEGER NOT NULL,

    -- Code scaffolding
    starter_code TEXT,
    solution_code TEXT,

    -- Test cases (for LLM evaluation)
    test_cases JSONB,

    -- Metadata
    topics VARCHAR(255)[],
    time_estimate_minutes INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(interview_id, question_number)
);

-- Coding Submissions (Candidate submissions)
CREATE TABLE coding_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES coding_interviews(id) ON DELETE CASCADE NOT NULL,

    -- Candidate info
    candidate_name VARCHAR(255) NOT NULL,
    candidate_email VARCHAR(255) NOT NULL,
    candidate_phone VARCHAR(50),

    -- Submission tracking
    started_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'in_progress',

    -- Language preference
    preferred_language VARCHAR(50),

    -- Scoring
    total_marks_obtained DECIMAL(10, 2),
    percentage DECIMAL(5, 2),

    -- Session metadata
    ip_address INET,
    user_agent TEXT,
    session_duration_seconds INTEGER,

    -- Flags
    late_submission BOOLEAN DEFAULT false,
    suspicious_activity BOOLEAN DEFAULT false,

    -- Resume upload
    resume_path VARCHAR(500),
    resume_uploaded_at TIMESTAMP,

    -- Signature/terms
    signature_data TEXT,
    signature_accepted_at TIMESTAMP,
    terms_ip_address TEXT,

    -- Decision tracking
    candidate_decision VARCHAR(20) DEFAULT 'pending',
    decision_notes TEXT,
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES users(id),

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Pre-registered candidates table
CREATE TABLE interview_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID NOT NULL REFERENCES coding_interviews(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interview_id, email)
);

-- Coding Answers (Per-question code submissions)
CREATE TABLE coding_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES coding_submissions(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES coding_questions(id) ON DELETE CASCADE NOT NULL,

    -- Code submission
    submitted_code TEXT,
    programming_language VARCHAR(50),

    -- Evaluation
    marks_awarded DECIMAL(10, 2),
    is_correct BOOLEAN DEFAULT false,
    similarity_score DECIMAL(5, 2),

    -- Feedback
    feedback TEXT,
    key_points_covered TEXT[],
    key_points_missed TEXT[],
    code_quality_score DECIMAL(5, 2),

    -- Metadata
    evaluated_at TIMESTAMP,
    evaluated_by_model VARCHAR(100),
    evaluator_id UUID REFERENCES users(id),
    evaluator_notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(submission_id, question_id)
);

-- Session Activities (Anti-cheating event log)
CREATE TABLE session_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES coding_submissions(id) ON DELETE CASCADE NOT NULL,

    -- Activity tracking
    activity_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Context
    question_id UUID REFERENCES coding_questions(id) ON DELETE SET NULL,
    metadata JSONB,

    -- Analysis
    flagged BOOLEAN DEFAULT false,
    severity VARCHAR(20) DEFAULT 'low'
);

-- ============================================================================
-- SECTION 7: VOICE SCREENING
-- ============================================================================

-- Voice Screening Campaigns
CREATE TABLE voice_screening_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    job_id UUID REFERENCES job_descriptions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Campaign metadata
    name TEXT NOT NULL,
    job_role TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,

    -- Job requirements (for AI context)
    job_description_text TEXT,
    technical_requirements TEXT,

    -- User-provided configuration
    custom_questions TEXT[] DEFAULT '{}',
    required_fields TEXT[] DEFAULT '{}',
    interview_persona TEXT DEFAULT 'professional' CHECK (interview_persona IN ('professional', 'casual', 'technical')),
    candidate_type TEXT DEFAULT 'general' CHECK (candidate_type IN ('fresher', 'experienced', 'general')),
    interview_style TEXT DEFAULT 'conversational' CHECK (interview_style IN ('structured', 'adaptive', 'conversational')),

    -- Scheduling (similar to coding interviews)
    scheduled_start_time TIMESTAMPTZ,
    scheduled_end_time TIMESTAMPTZ,
    grace_period_minutes INTEGER DEFAULT 15,
    interview_duration_minutes INTEGER DEFAULT 15,

    -- AI-generated VAPI configuration
    generated_system_prompt TEXT NOT NULL,
    generated_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    vapi_config JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- VAPI knowledge base integration
    knowledge_base_file_ids JSONB DEFAULT '[]'::jsonb,
    vapi_functions JSONB DEFAULT '[]'::jsonb,

    -- Model tracking
    generation_model TEXT,
    generation_metadata JSONB DEFAULT '{}'::jsonb,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Voice Candidates
CREATE TABLE voice_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Campaign link
    campaign_id UUID REFERENCES voice_screening_campaigns(id) ON DELETE CASCADE,

    -- Candidate identity
    interview_token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,

    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    latest_call_id TEXT,

    -- Timing tracking
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    time_expired BOOLEAN DEFAULT FALSE,

    -- Notes
    recruiter_notes TEXT
);

-- Voice Call History
CREATE TABLE voice_call_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to candidate
    candidate_id UUID NOT NULL REFERENCES voice_candidates(id) ON DELETE CASCADE,

    -- Call identification
    call_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'no_answer', 'busy')),

    -- Call timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Call content
    transcript TEXT,
    recording_url TEXT,

    -- Dynamically extracted data (flexible JSONB schema per campaign)
    structured_data JSONB DEFAULT '{}'::jsonb,

    -- AI-generated analysis
    interview_summary TEXT,
    key_points JSONB DEFAULT '[]'::jsonb,
    technical_assessment JSONB DEFAULT '{}'::jsonb,

    -- Disconnect tracking
    disconnect_events JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    call_type TEXT DEFAULT 'actual' CHECK (call_type IN ('test', 'actual', 'follow_up', 'rescreen')),
    initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,

    -- VAPI metadata
    vapi_cost_cents INTEGER,
    vapi_duration_minutes DECIMAL(10, 2),
    vapi_metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- SECTION 8: CANDIDATE PIPELINE
-- ============================================================================

-- Pipeline Candidates (Unified lifecycle tracking)
CREATE TABLE pipeline_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    job_id UUID NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    candidate_name TEXT NOT NULL,
    candidate_email TEXT NOT NULL,
    candidate_phone TEXT,

    -- Stage tracking
    current_stage TEXT NOT NULL DEFAULT 'resume_screening'
        CHECK (current_stage IN ('resume_screening', 'technical_assessment', 'voice_screening', 'completed')),
    skipped_stages TEXT[] DEFAULT '{}',

    -- Cross-module foreign keys
    resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
    coding_submission_id UUID REFERENCES coding_submissions(id) ON DELETE SET NULL,
    voice_candidate_id UUID REFERENCES voice_candidates(id) ON DELETE SET NULL,

    -- Denormalized scores
    resume_match_score FLOAT,
    coding_score FLOAT,
    coding_percentage FLOAT,
    voice_status TEXT,

    -- Recommendation
    recommendation TEXT DEFAULT 'pending'
        CHECK (recommendation IN ('highly_recommended', 'recommended', 'not_recommended', 'pending')),

    -- Final hiring decision
    final_decision TEXT DEFAULT 'pending'
        CHECK (final_decision IN ('pending', 'selected', 'rejected', 'hold')),
    decision_notes TEXT,
    decided_by UUID REFERENCES users(id),
    decided_at TIMESTAMPTZ,

    -- Campaign and slot (Migration 041)
    campaign_id UUID REFERENCES hiring_campaigns(id) ON DELETE SET NULL,
    interview_slot JSONB DEFAULT NULL,

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Partial unique index: only applies to non-deleted rows (allows re-adding deleted candidates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_candidates_job_email_active
    ON pipeline_candidates(job_id, candidate_email)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- SECTION 8B: HIRING CAMPAIGNS (Migration 041)
-- ============================================================================

CREATE TABLE IF NOT EXISTS hiring_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,

    -- Campaign status
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'archived')),

    -- Metadata: slots, target roles, custom fields
    metadata JSONB DEFAULT '{
        "slots": [],
        "target_roles": [],
        "settings": {}
    }'::jsonb,

    -- Audit fields
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(org_id, name)
);

-- ============================================================================
-- SECTION 9: LLM & AUDIT
-- ============================================================================

-- LLM Model Configurations
CREATE TABLE llm_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    provider VARCHAR(50) DEFAULT 'ollama',
    model_identifier VARCHAR(255),
    capabilities JSONB,
    is_active BOOLEAN DEFAULT false,
    parameters JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- SECTION 10: INDEXES
-- ============================================================================

-- Job Descriptions indexes
CREATE INDEX idx_jd_created_by ON job_descriptions(created_by);
CREATE INDEX idx_jd_status ON job_descriptions(status);
CREATE INDEX idx_jd_search ON job_descriptions USING GIN(search_vector);
CREATE INDEX idx_jd_embedding ON job_descriptions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_job_descriptions_org ON job_descriptions(org_id);
CREATE INDEX idx_job_descriptions_active ON job_descriptions(org_id) WHERE deleted_at IS NULL;

-- Resumes indexes
CREATE INDEX idx_resume_jd ON resumes(job_description_id);
CREATE INDEX idx_resume_score ON resumes(match_score DESC);
CREATE INDEX idx_resume_status ON resumes(status);
CREATE INDEX idx_resume_search ON resumes USING GIN(search_vector);
CREATE INDEX idx_resume_embedding ON resumes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_resumes_org ON resumes(org_id);

-- Tests indexes
CREATE INDEX idx_test_domain ON tests(domain);
CREATE INDEX idx_test_created_by ON tests(created_by);
CREATE INDEX idx_tests_test_type ON tests(test_type);
CREATE INDEX idx_tests_question_paper_path ON tests(question_paper_path);
CREATE INDEX idx_tests_org ON tests(org_id);
CREATE INDEX idx_tests_active ON tests(org_id) WHERE deleted_at IS NULL;

-- Questions indexes
CREATE INDEX idx_question_test ON questions(test_id);

-- Answer Sheets indexes
CREATE INDEX idx_answer_sheet_test ON answer_sheets(test_id);
CREATE INDEX idx_answer_sheet_status ON answer_sheets(status);
CREATE INDEX idx_answer_sheets_submitted_by ON answer_sheets(submitted_by);
CREATE INDEX idx_answer_sheets_org ON answer_sheets(org_id);

-- Answer Evaluations indexes
CREATE INDEX idx_answer_eval_sheet ON answer_evaluations(answer_sheet_id);

-- Coding Interviews indexes
CREATE INDEX idx_coding_interviews_status ON coding_interviews(status);
CREATE INDEX idx_coding_interviews_access_token ON coding_interviews(access_token);
CREATE INDEX idx_coding_interviews_created_by ON coding_interviews(created_by);
CREATE INDEX idx_coding_interviews_interview_type ON coding_interviews(interview_type);
CREATE INDEX idx_coding_interviews_allowed_languages ON coding_interviews USING GIN(allowed_languages);
CREATE INDEX idx_coding_interviews_org ON coding_interviews(org_id);
CREATE INDEX idx_coding_interviews_job ON coding_interviews(job_id);
CREATE INDEX idx_coding_interviews_active ON coding_interviews(org_id) WHERE deleted_at IS NULL;

-- Coding Questions indexes
CREATE INDEX idx_coding_questions_interview ON coding_questions(interview_id);
CREATE INDEX idx_coding_questions_difficulty ON coding_questions(difficulty);

-- Coding Submissions indexes
CREATE INDEX idx_coding_submissions_interview ON coding_submissions(interview_id);
CREATE INDEX idx_coding_submissions_status ON coding_submissions(status);
CREATE INDEX idx_coding_submissions_email ON coding_submissions(candidate_email);
CREATE INDEX idx_coding_submissions_suspicious ON coding_submissions(suspicious_activity);

-- Interview Candidates indexes
CREATE INDEX idx_interview_candidates_interview_id ON interview_candidates(interview_id);

-- Coding Answers indexes
CREATE INDEX idx_coding_answers_submission ON coding_answers(submission_id);
CREATE INDEX idx_coding_answers_question ON coding_answers(question_id);
CREATE INDEX idx_coding_answers_is_correct ON coding_answers(is_correct);

-- Session Activities indexes
CREATE INDEX idx_session_activities_submission ON session_activities(submission_id);
CREATE INDEX idx_session_activities_type ON session_activities(activity_type);
CREATE INDEX idx_session_activities_flagged ON session_activities(flagged);
CREATE INDEX idx_session_activities_timestamp ON session_activities(timestamp);

-- Voice Campaigns indexes
CREATE INDEX idx_campaigns_active ON voice_screening_campaigns(is_active, created_by);
CREATE INDEX idx_campaigns_created_by ON voice_screening_campaigns(created_by);
CREATE INDEX idx_campaigns_job_role ON voice_screening_campaigns(job_role);
CREATE INDEX idx_voice_screening_campaigns_org ON voice_screening_campaigns(org_id);
CREATE INDEX idx_voice_campaigns_job ON voice_screening_campaigns(job_id);
CREATE INDEX idx_voice_campaigns_active ON voice_screening_campaigns(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_voice_campaigns_scheduled ON voice_screening_campaigns(scheduled_start_time, scheduled_end_time) WHERE deleted_at IS NULL AND is_active = TRUE;

-- Voice Candidates indexes
CREATE INDEX idx_candidates_campaign ON voice_candidates(campaign_id);
CREATE INDEX idx_candidates_token ON voice_candidates(interview_token);
CREATE INDEX idx_candidates_status ON voice_candidates(status);
CREATE INDEX idx_candidates_created_by ON voice_candidates(created_by);
CREATE INDEX idx_voice_candidates_org ON voice_candidates(org_id);

-- Voice Call History indexes
CREATE INDEX idx_call_history_candidate ON voice_call_history(candidate_id);
CREATE INDEX idx_call_history_call_id ON voice_call_history(call_id);
CREATE INDEX idx_call_history_status ON voice_call_history(status);
CREATE INDEX idx_call_history_created_at ON voice_call_history(created_at DESC);
CREATE INDEX idx_voice_call_history_disconnect_events ON voice_call_history USING GIN (disconnect_events);

-- Pipeline Candidates indexes
CREATE INDEX idx_pipeline_job_stage ON pipeline_candidates(job_id, current_stage);
CREATE INDEX idx_pipeline_email ON pipeline_candidates(candidate_email);
CREATE INDEX idx_pipeline_created_by ON pipeline_candidates(created_by);
CREATE INDEX idx_pipeline_candidates_org ON pipeline_candidates(org_id);
CREATE INDEX idx_pipeline_candidates_active ON pipeline_candidates(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pipeline_candidates_org_job ON pipeline_candidates(org_id, job_id);
CREATE INDEX idx_pipeline_candidates_org_stage ON pipeline_candidates(org_id, current_stage);
CREATE INDEX idx_pipeline_candidates_campaign ON pipeline_candidates(campaign_id);
CREATE INDEX idx_pipeline_candidates_campaign_job ON pipeline_candidates(campaign_id, job_id);
CREATE INDEX idx_pipeline_candidates_campaign_stage ON pipeline_candidates(campaign_id, current_stage);
CREATE INDEX idx_pipeline_candidates_slot ON pipeline_candidates USING GIN (interview_slot);

-- Hiring Campaigns indexes
CREATE INDEX idx_campaigns_org ON hiring_campaigns(org_id);
CREATE INDEX idx_campaigns_status ON hiring_campaigns(status);
CREATE INDEX idx_campaigns_created_by ON hiring_campaigns(created_by);
CREATE INDEX idx_campaigns_org_status ON hiring_campaigns(org_id, status);
CREATE INDEX idx_campaigns_metadata ON hiring_campaigns USING GIN (metadata);

-- Organization indexes
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(org_id);
CREATE INDEX idx_org_invitations_token ON organization_invitations(token);
CREATE INDEX idx_org_invitations_email ON organization_invitations(email);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_domain_join ON organizations(allow_domain_join) WHERE allow_domain_join = TRUE;
CREATE UNIQUE INDEX idx_organizations_join_link_token ON organizations(join_link_token) WHERE join_link_token IS NOT NULL;

-- Audit indexes
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================================
-- SECTION 11: FUNCTIONS
-- ============================================================================

-- Vector similarity search functions
CREATE OR REPLACE FUNCTION match_resumes_to_job(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    candidate_name text,
    candidate_email text,
    resume_text text,
    match_score float,
    match_details jsonb,
    skills_extracted jsonb,
    file_name text,
    created_at timestamptz,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.candidate_name,
        r.candidate_email,
        r.raw_text,
        r.match_score,
        r.skill_match,
        r.parsed_data->'skills' as skills_extracted,
        r.file_path,
        r.created_at,
        1 - (r.embedding <=> query_embedding) as similarity
    FROM resumes r
    WHERE r.embedding IS NOT NULL
        AND 1 - (r.embedding <=> query_embedding) > match_threshold
    ORDER BY r.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_jobs_to_resume(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    title text,
    department text,
    description text,
    skills_required jsonb,
    file_name text,
    created_at timestamptz,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        jd.id,
        jd.title,
        jd.department,
        jd.description,
        jd.parsed_data->'required_skills' as skills_required,
        jd.file_path,
        jd.created_at,
        1 - (jd.embedding <=> query_embedding) as similarity
    FROM job_descriptions jd
    WHERE jd.embedding IS NOT NULL
        AND 1 - (jd.embedding <=> query_embedding) > match_threshold
    ORDER BY jd.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION find_similar_resumes(
    target_resume_id uuid,
    match_threshold float DEFAULT 0.8,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    candidate_name text,
    candidate_email text,
    similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
    target_embedding vector(768);
BEGIN
    SELECT embedding INTO target_embedding
    FROM resumes
    WHERE id = target_resume_id;

    IF target_embedding IS NULL THEN
        RAISE EXCEPTION 'Resume not found or has no embedding: %', target_resume_id;
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.candidate_name,
        r.candidate_email,
        1 - (r.embedding <=> target_embedding) as similarity
    FROM resumes r
    WHERE r.id != target_resume_id
        AND r.embedding IS NOT NULL
        AND 1 - (r.embedding <=> target_embedding) > match_threshold
    ORDER BY r.embedding <=> target_embedding
    LIMIT match_count;
END;
$$;

-- Auto-assign HR role to new users
CREATE OR REPLACE FUNCTION auto_assign_hr_role()
RETURNS TRIGGER AS $$
DECLARE
    hr_role_id UUID;
BEGIN
    SELECT id INTO hr_role_id FROM roles WHERE name = 'hr';

    IF hr_role_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role_id, assigned_at)
        VALUES (NEW.id, hr_role_id, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_call_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_pipeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_pipeline_candidate_org_match()
RETURNS TRIGGER AS $$
DECLARE
    job_org_id UUID;
BEGIN
    IF NEW.job_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT org_id INTO job_org_id
    FROM job_descriptions
    WHERE id = NEW.job_id;

    IF job_org_id IS NULL THEN
        RAISE EXCEPTION 'Job description % does not exist', NEW.job_id;
    END IF;

    IF NEW.org_id != job_org_id THEN
        RAISE EXCEPTION 'Pipeline candidate org_id (%) does not match job description org_id (%)',
            NEW.org_id, job_org_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Campaign helper functions (Migration 041)
CREATE OR REPLACE FUNCTION get_campaign_statistics(p_campaign_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_candidates', COUNT(*),
        'by_stage', jsonb_build_object(
            'resume_screening', COUNT(*) FILTER (WHERE current_stage = 'resume_screening'),
            'technical_assessment', COUNT(*) FILTER (WHERE current_stage = 'technical_assessment'),
            'voice_screening', COUNT(*) FILTER (WHERE current_stage = 'voice_screening'),
            'completed', COUNT(*) FILTER (WHERE current_stage = 'completed')
        ),
        'by_decision', jsonb_build_object(
            'pending', COUNT(*) FILTER (WHERE final_decision = 'pending'),
            'selected', COUNT(*) FILTER (WHERE final_decision = 'selected'),
            'rejected', COUNT(*) FILTER (WHERE final_decision = 'rejected'),
            'hold', COUNT(*) FILTER (WHERE final_decision = 'hold')
        ),
        'by_recommendation', jsonb_build_object(
            'highly_recommended', COUNT(*) FILTER (WHERE recommendation = 'highly_recommended'),
            'recommended', COUNT(*) FILTER (WHERE recommendation = 'recommended'),
            'not_recommended', COUNT(*) FILTER (WHERE recommendation = 'not_recommended'),
            'pending', COUNT(*) FILTER (WHERE recommendation = 'pending')
        ),
        'unique_jobs', COUNT(DISTINCT job_id),
        'avg_resume_score', ROUND(AVG(resume_match_score)::numeric, 2),
        'avg_coding_score', ROUND(AVG(coding_score)::numeric, 2)
    )
    INTO result
    FROM pipeline_candidates
    WHERE campaign_id = p_campaign_id
      AND deleted_at IS NULL;  -- Exclude soft-deleted candidates

    RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_campaign_candidates_summary(p_campaign_id UUID)
RETURNS TABLE(
    job_title TEXT,
    total_count BIGINT,
    resume_screening_count BIGINT,
    technical_assessment_count BIGINT,
    voice_screening_count BIGINT,
    completed_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(jd.title::text, 'No Job Assigned') AS job_title,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'resume_screening') AS resume_screening_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'technical_assessment') AS technical_assessment_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'voice_screening') AS voice_screening_count,
        COUNT(*) FILTER (WHERE pc.current_stage = 'completed') AS completed_count
    FROM pipeline_candidates pc
    LEFT JOIN job_descriptions jd ON pc.job_id = jd.id
    WHERE pc.campaign_id = p_campaign_id
      AND pc.deleted_at IS NULL  -- Exclude soft-deleted candidates
    GROUP BY jd.title
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_hiring_campaigns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 12: TRIGGERS
-- ============================================================================

-- Auto-assign role trigger
DROP TRIGGER IF EXISTS trigger_auto_assign_role ON users;
CREATE TRIGGER trigger_auto_assign_role
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_hr_role();

-- Updated_at triggers
CREATE TRIGGER update_coding_interviews_updated_at BEFORE UPDATE ON coding_interviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coding_answers_updated_at BEFORE UPDATE ON coding_answers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON voice_screening_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_campaigns_updated_at();

CREATE TRIGGER candidates_updated_at
    BEFORE UPDATE ON voice_candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_candidates_updated_at();

CREATE TRIGGER call_history_updated_at
    BEFORE UPDATE ON voice_call_history
    FOR EACH ROW
    EXECUTE FUNCTION update_call_history_updated_at();

CREATE TRIGGER pipeline_candidates_updated_at
    BEFORE UPDATE ON pipeline_candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_updated_at();

CREATE TRIGGER trigger_validate_pipeline_org_match
    BEFORE INSERT OR UPDATE OF job_id, org_id ON pipeline_candidates
    FOR EACH ROW
    EXECUTE FUNCTION validate_pipeline_candidate_org_match();

CREATE TRIGGER trigger_hiring_campaigns_updated_at
    BEFORE UPDATE ON hiring_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_hiring_campaigns_timestamp();

-- ============================================================================
-- SECTION 13: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE coding_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_screening_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_call_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_candidates ENABLE ROW LEVEL SECURITY;

-- Coding Interviews policies
CREATE POLICY coding_interviews_select_policy ON coding_interviews
    FOR SELECT USING (created_by = auth.uid());

CREATE POLICY coding_interviews_insert_policy ON coding_interviews
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY coding_interviews_update_policy ON coding_interviews
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY coding_interviews_delete_policy ON coding_interviews
    FOR DELETE USING (created_by = auth.uid());

-- Coding Questions policies
CREATE POLICY coding_questions_select_policy ON coding_questions
    FOR SELECT USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

CREATE POLICY coding_questions_insert_policy ON coding_questions
    FOR INSERT WITH CHECK (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

CREATE POLICY coding_questions_update_policy ON coding_questions
    FOR UPDATE USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

CREATE POLICY coding_questions_delete_policy ON coding_questions
    FOR DELETE USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- Coding Submissions policies
CREATE POLICY coding_submissions_select_policy ON coding_submissions
    FOR SELECT USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

CREATE POLICY coding_submissions_insert_policy ON coding_submissions
    FOR INSERT WITH CHECK (true);

CREATE POLICY coding_submissions_update_policy ON coding_submissions
    FOR UPDATE USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- Coding Answers policies
CREATE POLICY coding_answers_select_policy ON coding_answers
    FOR SELECT USING (
        submission_id IN (
            SELECT id FROM coding_submissions
            WHERE interview_id IN (
                SELECT id FROM coding_interviews WHERE created_by = auth.uid()
            )
        )
    );

CREATE POLICY coding_answers_insert_policy ON coding_answers
    FOR INSERT WITH CHECK (true);

CREATE POLICY coding_answers_update_policy ON coding_answers
    FOR UPDATE USING (true);

-- Session Activities policies
CREATE POLICY session_activities_select_policy ON session_activities
    FOR SELECT USING (
        submission_id IN (
            SELECT id FROM coding_submissions
            WHERE interview_id IN (
                SELECT id FROM coding_interviews WHERE created_by = auth.uid()
            )
        )
    );

CREATE POLICY session_activities_insert_policy ON session_activities
    FOR INSERT WITH CHECK (true);

-- Voice Campaigns policies
CREATE POLICY campaigns_select_own ON voice_screening_campaigns
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY campaigns_insert_own ON voice_screening_campaigns
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY campaigns_update_own ON voice_screening_campaigns
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY campaigns_delete_own ON voice_screening_campaigns
    FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY campaigns_service_role ON voice_screening_campaigns
    FOR ALL USING (auth.role() = 'service_role');

-- Voice Candidates policies
CREATE POLICY candidates_select_own ON voice_candidates
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY candidates_insert_own ON voice_candidates
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY candidates_update_own ON voice_candidates
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY candidates_delete_own ON voice_candidates
    FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY candidates_service_role ON voice_candidates
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY candidates_public_by_token ON voice_candidates
    FOR SELECT USING (true);

-- Voice Call History policies
CREATE POLICY call_history_select_own ON voice_call_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

CREATE POLICY call_history_insert_own ON voice_call_history
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

CREATE POLICY call_history_update_own ON voice_call_history
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM voice_candidates
            WHERE voice_candidates.id = voice_call_history.candidate_id
            AND voice_candidates.created_by = auth.uid()
        )
    );

CREATE POLICY call_history_service_role ON voice_call_history
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY call_history_public_by_call_id ON voice_call_history
    FOR SELECT USING (true);

-- Pipeline Candidates policies
CREATE POLICY "Pipeline org isolation" ON pipeline_candidates
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Hiring Campaigns RLS (Migration 041)
ALTER TABLE hiring_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaigns org isolation" ON hiring_campaigns
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================================================
-- SECTION 14: SEED DATA
-- ============================================================================

-- Insert default roles
INSERT INTO roles (name, description, permissions) VALUES
    ('admin', 'System administrator with full access', '["user_manage", "system_settings", "view_all_data", "manage_models"]'::jsonb),
    ('hr', 'HR personnel who manage job descriptions and resumes', '["create_jobs", "view_own_jobs", "upload_resumes", "view_candidates"]'::jsonb),
    ('interviewer', 'Interviewer who creates and evaluates tests', '["create_tests", "view_own_tests", "upload_answers", "view_results"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Insert default LLM models
INSERT INTO llm_models (name, provider, model_identifier, capabilities, is_active, parameters) VALUES
    ('Qwen 2.5 7B', 'ollama', 'qwen2.5:7b', '{"general": true, "fast": true}'::jsonb, true, '{"temperature": 0.7, "top_p": 0.9}'::jsonb),
    ('Llava 7B', 'ollama', 'llava:7b', '{"vision": true, "multimodal": true}'::jsonb, false, '{"temperature": 0.7, "top_p": 0.9}'::jsonb),
    ('CodeLlama 7B', 'ollama', 'codellama:7b', '{"code": true, "technical": true}'::jsonb, false, '{"temperature": 0.5, "top_p": 0.95}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SECTION 15: GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION match_resumes_to_job TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_to_resume TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_resumes TO authenticated;

-- ============================================================================
-- SECTION 16: COMMENTS
-- ============================================================================

-- Table comments
COMMENT ON TABLE users IS 'User accounts linked to Supabase Auth';
COMMENT ON TABLE organizations IS 'Multi-tenant organizations';
COMMENT ON TABLE job_descriptions IS 'Job postings with vector embeddings for matching';
COMMENT ON TABLE resumes IS 'Candidate resumes with matching scores';
COMMENT ON TABLE tests IS 'Test/exam question papers';
COMMENT ON TABLE questions IS 'Individual questions from tests';
COMMENT ON TABLE answer_sheets IS 'Candidate answer submissions';
COMMENT ON TABLE answer_evaluations IS 'Per-question LLM evaluations';
COMMENT ON TABLE coding_interviews IS 'Coding interview sessions with time-bound access';
COMMENT ON TABLE coding_questions IS 'Interview questions with starter code and test cases';
COMMENT ON TABLE coding_submissions IS 'Candidate submissions and session metadata';
COMMENT ON TABLE coding_answers IS 'Per-question code submissions and evaluations';
COMMENT ON TABLE session_activities IS 'Anti-cheating event log for tracking tab switches, copy/paste, etc.';
COMMENT ON TABLE voice_screening_campaigns IS 'Voice interview campaigns with AI-generated VAPI configurations and knowledge base support';
COMMENT ON TABLE voice_candidates IS 'Minimal candidate info - all extracted data lives in call_history.structured_data';
COMMENT ON TABLE voice_call_history IS 'Complete history of all calls with dynamic structured_data, AI summaries, and assessments';
COMMENT ON TABLE pipeline_candidates IS 'Unified candidate lifecycle across Resume → Coding → Voice';
COMMENT ON TABLE hiring_campaigns IS 'Hiring campaigns (Pipeline 1, 2, 3...) to organize candidates by hiring drive';

-- Column comments
COMMENT ON COLUMN tests.metadata IS 'Stores file metadata, extraction info, and model information';
COMMENT ON COLUMN tests.domain IS 'Legacy field - use test_type instead. Kept for backward compatibility.';
COMMENT ON COLUMN questions.metadata IS 'Stores question difficulty, topics, and other attributes';
COMMENT ON COLUMN answer_sheets.file_path IS 'Legacy field - use answer_sheet_path instead. Kept for backward compatibility.';
COMMENT ON COLUMN answer_sheets.uploaded_by IS 'Legacy field - use submitted_by instead. Kept for backward compatibility.';
COMMENT ON COLUMN answer_sheets.metadata IS 'Stores file metadata and extraction information';
COMMENT ON COLUMN answer_evaluations.metadata IS 'Stores max_marks, question_number, and reasoning for evaluation';
COMMENT ON COLUMN coding_interviews.access_token IS 'Unique token for shareable candidate link';
COMMENT ON COLUMN coding_interviews.interview_type IS 'Type: coding, testing, or both';
COMMENT ON COLUMN coding_interviews.programming_language IS 'Default/suggested language (deprecated, use allowed_languages)';
COMMENT ON COLUMN coding_interviews.allowed_languages IS 'Array of programming languages candidates can choose from. NULL or empty array [] means ANY language allowed (no restrictions)';
COMMENT ON COLUMN coding_interviews.resume_required IS 'Resume upload requirement: mandatory, optional, or disabled';
COMMENT ON COLUMN coding_interviews.bond_terms IS 'Terms and conditions text for bond agreement';
COMMENT ON COLUMN coding_interviews.bond_document_url IS 'URL to uploaded bond document (Word/PDF)';
COMMENT ON COLUMN coding_interviews.require_signature IS 'Whether candidate must sign bond terms';
COMMENT ON COLUMN coding_interviews.bond_years IS 'Number of years for bond agreement';
COMMENT ON COLUMN coding_interviews.bond_timing IS 'When bond agreement appears: before_start | before_submission';
COMMENT ON COLUMN coding_submissions.suspicious_activity IS 'Flagged by anti-cheating system';
COMMENT ON COLUMN coding_submissions.resume_path IS 'Path to uploaded resume (optional)';
COMMENT ON COLUMN coding_submissions.preferred_language IS 'Programming language chosen by the candidate from allowed_languages';
COMMENT ON COLUMN coding_submissions.signature_data IS 'Base64 encoded signature image data';
COMMENT ON COLUMN coding_submissions.signature_accepted_at IS 'Timestamp when signature was provided';
COMMENT ON COLUMN coding_submissions.terms_ip_address IS 'IP address from which terms were accepted';
COMMENT ON COLUMN session_activities.activity_type IS 'tab_switch, copy, paste, blur, focus, code_change';
COMMENT ON COLUMN voice_screening_campaigns.knowledge_base_file_ids IS 'Array of VAPI file IDs for RAG knowledge base';
COMMENT ON COLUMN voice_screening_campaigns.vapi_functions IS 'VAPI function calling definitions (e.g., end_call)';
COMMENT ON COLUMN voice_screening_campaigns.interview_style IS 'structured (fixed questions), adaptive (follow-ups), conversational (dynamic)';
COMMENT ON COLUMN voice_candidates.latest_call_id IS 'Reference to most recent call in voice_call_history';
COMMENT ON COLUMN voice_call_history.structured_data IS 'Dynamically extracted data per campaign schema (JSONB for flexibility)';
COMMENT ON COLUMN voice_call_history.interview_summary IS 'AI-generated 2-3 sentence assessment';
COMMENT ON COLUMN voice_call_history.key_points IS 'Array of key takeaways (strengths, weaknesses, notable mentions)';
COMMENT ON COLUMN voice_call_history.technical_assessment IS 'Skills evaluation with recommendation (Yes/No/Maybe)';
COMMENT ON COLUMN voice_call_history.disconnect_events IS 'Array of disconnection/reconnection events during the call. Format: [{"timestamp": "ISO8601", "event_type": "disconnect|reconnect", "reason": "string", "reconnection_attempt": number}]';
COMMENT ON COLUMN organizations.allow_domain_join IS 'Enable automatic joining for users with matching email domains';
COMMENT ON COLUMN organizations.auto_join_domains IS 'Array of email domains that can auto-join (e.g., {acme.com, acme.io})';
COMMENT ON COLUMN organizations.auto_join_role IS 'Default role assigned when users auto-join via domain match (viewer|interviewer|hr|admin)';
COMMENT ON COLUMN organizations.join_link_token IS 'Unique token for shareable join link. Anyone with this link can join the organization.';
COMMENT ON COLUMN organizations.join_link_enabled IS 'Whether the join link is currently active. Owners can disable without changing the token.';
COMMENT ON COLUMN organizations.join_link_role IS 'Default role assigned to members who join via the link (default: interviewer)';
COMMENT ON COLUMN hiring_campaigns.metadata IS 'Stores slots configuration, target roles, and custom settings';
COMMENT ON COLUMN pipeline_candidates.campaign_id IS 'Links candidate to a hiring campaign (Migration 041)';
COMMENT ON COLUMN pipeline_candidates.interview_slot IS 'Stores slot info: {slot: "morning/evening", scheduled_date: "...", time_window: "..."} (Migration 041)';

COMMENT ON FUNCTION get_campaign_statistics(UUID) IS 'Returns comprehensive statistics for a campaign';
COMMENT ON FUNCTION get_campaign_candidates_summary(UUID) IS 'Returns candidate counts by job and stage';

-- ============================================================================
-- END OF CONSOLIDATED SCHEMA
-- ============================================================================
