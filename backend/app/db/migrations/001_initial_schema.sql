-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- For pgvector support

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
    name VARCHAR(50) UNIQUE NOT NULL, -- 'admin', 'hr', 'interviewer'
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

-- Job Descriptions
CREATE TABLE job_descriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    experience_required VARCHAR(50),

    -- Document info
    file_path TEXT NOT NULL,
    file_type VARCHAR(20),
    file_size INTEGER,

    -- Parsed content
    raw_text TEXT,
    parsed_data JSONB,

    -- Vector embedding (pgvector - 768 dimensions for all-MiniLM-L6-v2)
    embedding vector(768),

    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active',

    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(raw_text, ''))
    ) STORED
);

CREATE INDEX idx_jd_created_by ON job_descriptions(created_by);
CREATE INDEX idx_jd_status ON job_descriptions(status);
CREATE INDEX idx_jd_search ON job_descriptions USING GIN(search_vector);
-- Vector similarity search index (IVFFlat for faster searches)
CREATE INDEX idx_jd_embedding ON job_descriptions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Resumes
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX idx_resume_jd ON resumes(job_description_id);
CREATE INDEX idx_resume_score ON resumes(match_score DESC);
CREATE INDEX idx_resume_status ON resumes(status);
CREATE INDEX idx_resume_search ON resumes USING GIN(search_vector);
CREATE INDEX idx_resume_embedding ON resumes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tests
CREATE TABLE tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    domain VARCHAR(100) NOT NULL,
    description TEXT,
    duration_minutes INTEGER,
    total_marks INTEGER,

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft'
);

CREATE INDEX idx_test_domain ON tests(domain);
CREATE INDEX idx_test_created_by ON tests(created_by);

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

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(test_id, question_number)
);

CREATE INDEX idx_question_test ON questions(test_id);

-- Answer Sheets
CREATE TABLE answer_sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Candidate info
    candidate_name VARCHAR(255),
    candidate_email VARCHAR(255),
    candidate_id VARCHAR(100),

    -- Document info
    file_path TEXT NOT NULL,
    file_type VARCHAR(20),
    file_size INTEGER,

    -- Parsed content
    raw_text TEXT,
    parsed_answers JSONB,

    -- Evaluation results
    total_score DECIMAL(5,2),
    max_score INTEGER,
    percentage DECIMAL(5,2),
    question_scores JSONB,
    llm_feedback TEXT,

    -- Metadata
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    evaluated_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending'
);

CREATE INDEX idx_answer_sheet_test ON answer_sheets(test_id);
CREATE INDEX idx_answer_sheet_status ON answer_sheets(status);

-- Individual Answer Evaluations
CREATE TABLE answer_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_sheet_id UUID NOT NULL REFERENCES answer_sheets(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

    candidate_answer TEXT,
    awarded_marks DECIMAL(5,2),
    max_marks INTEGER,

    -- LLM evaluation
    is_correct BOOLEAN,
    similarity_score DECIMAL(5,2),
    llm_reasoning TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(answer_sheet_id, question_id)
);

CREATE INDEX idx_answer_eval_sheet ON answer_evaluations(answer_sheet_id);

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

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Insert default roles
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'Administrator with full access', '["*"]'::jsonb),
('hr', 'HR personnel with recruitment access', '["jd:*", "resume:*", "test:*"]'::jsonb),
('interviewer', 'Interviewer with read-only access', '["jd:read", "resume:read", "test:read"]'::jsonb);

-- Insert default LLM models
INSERT INTO llm_models (name, provider, model_identifier, capabilities, is_active, parameters) VALUES
('Mistral 7B', 'ollama', 'mistral:7b', '{"general": true, "fast": true}'::jsonb, true, '{"temperature": 0.7, "top_p": 0.9}'::jsonb),
('Llama 2 7B', 'ollama', 'llama2:7b', '{"general": true, "balanced": true}'::jsonb, false, '{"temperature": 0.7, "top_p": 0.9}'::jsonb),
('CodeLlama 7B', 'ollama', 'codellama:7b', '{"code": true, "technical": true}'::jsonb, false, '{"temperature": 0.5, "top_p": 0.95}'::jsonb),
('Llama 2 13B', 'ollama', 'llama2:13b', '{"general": true, "accurate": true}'::jsonb, false, '{"temperature": 0.7, "top_p": 0.9}'::jsonb);
