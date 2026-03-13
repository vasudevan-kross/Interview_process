-- Migration 009: Create Video Interview Tables
-- Description: Add support for video interviews with 100ms integration

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Video Interviews Table
CREATE TABLE IF NOT EXISTS video_interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Linking to existing tables
    job_description_id UUID NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
    candidate_email VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255),

    -- Interview Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    interview_type VARCHAR(20) DEFAULT 'panel',  -- 'panel', 'one_on_one', 'technical'
    status VARCHAR(20) DEFAULT 'scheduled',  -- 'scheduled', 'in_progress', 'completed', 'cancelled'

    -- Scheduling
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- 100ms Integration
    room_id VARCHAR(255) UNIQUE,  -- 100ms room ID
    room_name VARCHAR(255),
    session_id VARCHAR(255),  -- Active session ID
    recording_id VARCHAR(255),  -- 100ms recording ID

    -- Recording & Transcription
    recording_url TEXT,  -- Signed URL from Supabase Storage
    recording_path TEXT,  -- Path in Supabase bucket
    recording_duration_seconds INTEGER,
    transcript_url TEXT,
    transcript_path TEXT,
    transcript_text TEXT,  -- Full transcript

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(candidate_name, '') || ' ' ||
            coalesce(candidate_email, '') || ' ' ||
            coalesce(title, '')
        )
    ) STORED
);

-- Interview Participants (Interviewers + Candidate)
CREATE TABLE IF NOT EXISTS video_interview_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_interview_id UUID NOT NULL REFERENCES video_interviews(id) ON DELETE CASCADE,

    -- Participant Info
    user_id UUID REFERENCES users(id),  -- For registered users
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'interviewer',  -- 'interviewer', 'observer', 'candidate'

    -- 100ms Token
    join_token TEXT,  -- Generated auth token for this participant
    join_url TEXT,  -- Complete join URL

    -- Attendance
    joined_at TIMESTAMP WITH TIME ZONE,
    left_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interview Questions (Pre-loaded or added during interview)
CREATE TABLE IF NOT EXISTS video_interview_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_interview_id UUID NOT NULL REFERENCES video_interviews(id) ON DELETE CASCADE,

    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),  -- 'technical', 'behavioral', 'coding', 'system_design'
    difficulty VARCHAR(20),  -- 'easy', 'medium', 'hard'
    expected_duration_minutes INTEGER,

    -- For coding questions
    code_template TEXT,
    test_cases JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    skills_assessed JSONB DEFAULT '[]'::jsonb,
    topics JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(video_interview_id, question_number)
);

-- Interview Evaluations (AI + Human)
CREATE TABLE IF NOT EXISTS video_interview_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_interview_id UUID NOT NULL REFERENCES video_interviews(id) ON DELETE CASCADE,

    -- Evaluator
    evaluator_id UUID REFERENCES users(id),
    evaluation_type VARCHAR(20) DEFAULT 'human',  -- 'ai', 'human', 'hybrid'

    -- Overall Scores (0-100)
    overall_score DECIMAL(5,2),
    communication_score DECIMAL(5,2),
    technical_score DECIMAL(5,2),
    problem_solving_score DECIMAL(5,2),
    cultural_fit_score DECIMAL(5,2),

    -- Detailed Feedback
    strengths JSONB DEFAULT '[]'::jsonb,
    weaknesses JSONB DEFAULT '[]'::jsonb,
    key_highlights TEXT,
    concerns TEXT,

    -- Recommendation
    recommendation VARCHAR(50),  -- 'strong_hire', 'hire', 'maybe', 'no_hire', 'strong_no_hire'
    next_steps TEXT,

    -- AI Analysis (if evaluation_type = 'ai' or 'hybrid')
    ai_sentiment_score DECIMAL(5,2),
    ai_confidence DECIMAL(5,2),
    ai_insights JSONB DEFAULT '{}'::jsonb,
    model_used VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Per-Question Responses (Linked to transcript timestamps)
CREATE TABLE IF NOT EXISTS video_interview_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_interview_id UUID NOT NULL REFERENCES video_interviews(id) ON DELETE CASCADE,
    video_interview_question_id UUID REFERENCES video_interview_questions(id) ON DELETE SET NULL,

    -- Response Details
    question_asked_at_seconds INTEGER,  -- Timestamp in recording
    question_answered_at_seconds INTEGER,
    response_duration_seconds INTEGER,
    response_text TEXT,  -- Extracted from transcript

    -- Code Submission (for coding questions)
    code_submitted TEXT,
    code_language VARCHAR(50),
    code_execution_result JSONB DEFAULT '{}'::jsonb,

    -- Scoring
    score DECIMAL(5,2),
    max_score DECIMAL(5,2),
    feedback TEXT,

    -- AI Analysis
    ai_quality_score DECIMAL(5,2),
    ai_completeness_score DECIMAL(5,2),
    ai_feedback TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_video_interviews_job ON video_interviews(job_description_id);
CREATE INDEX IF NOT EXISTS idx_video_interviews_resume ON video_interviews(resume_id);
CREATE INDEX IF NOT EXISTS idx_video_interviews_status ON video_interviews(status);
CREATE INDEX IF NOT EXISTS idx_video_interviews_scheduled ON video_interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_video_interviews_candidate_email ON video_interviews(candidate_email);
CREATE INDEX IF NOT EXISTS idx_video_interviews_created_by ON video_interviews(created_by);
CREATE INDEX IF NOT EXISTS idx_video_interview_participants_interview ON video_interview_participants(video_interview_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_participants_user ON video_interview_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_questions_interview ON video_interview_questions(video_interview_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_evaluations_interview ON video_interview_evaluations(video_interview_id);
CREATE INDEX IF NOT EXISTS idx_video_interview_responses_interview ON video_interview_responses(video_interview_id);
CREATE INDEX IF NOT EXISTS idx_video_interviews_search ON video_interviews USING GIN(search_vector);

-- Add RLS (Row Level Security) Policies
ALTER TABLE video_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interview_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interview_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interview_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view interviews they created or are participating in
CREATE POLICY video_interviews_select_policy ON video_interviews
    FOR SELECT
    USING (
        created_by = auth.uid() OR
        id IN (
            SELECT video_interview_id FROM video_interview_participants
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Only HR and Admin can create interviews
CREATE POLICY video_interviews_insert_policy ON video_interviews
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.name IN ('admin', 'hr')
        )
    );

-- Policy: Only creator can update their interviews
CREATE POLICY video_interviews_update_policy ON video_interviews
    FOR UPDATE
    USING (created_by = auth.uid());

-- Policy: Only creator can delete their interviews
CREATE POLICY video_interviews_delete_policy ON video_interviews
    FOR DELETE
    USING (created_by = auth.uid());

-- Policy: Participants can view their own participation records
CREATE POLICY video_interview_participants_select_policy ON video_interview_participants
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        video_interview_id IN (
            SELECT id FROM video_interviews WHERE created_by = auth.uid()
        )
    );

-- Policy: Questions visible to interview creator and participants
CREATE POLICY video_interview_questions_select_policy ON video_interview_questions
    FOR SELECT
    USING (
        video_interview_id IN (
            SELECT id FROM video_interviews
            WHERE created_by = auth.uid()
        ) OR
        video_interview_id IN (
            SELECT video_interview_id FROM video_interview_participants
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Evaluations visible to evaluator and interview creator
CREATE POLICY video_interview_evaluations_select_policy ON video_interview_evaluations
    FOR SELECT
    USING (
        evaluator_id = auth.uid() OR
        video_interview_id IN (
            SELECT id FROM video_interviews WHERE created_by = auth.uid()
        )
    );

-- Policy: Responses visible to interview creator
CREATE POLICY video_interview_responses_select_policy ON video_interview_responses
    FOR SELECT
    USING (
        video_interview_id IN (
            SELECT id FROM video_interviews WHERE created_by = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON TABLE video_interviews IS 'Stores video interview sessions with 100ms integration';
COMMENT ON TABLE video_interview_participants IS 'Tracks all participants (interviewers and candidates) in video interviews';
COMMENT ON TABLE video_interview_questions IS 'Pre-loaded interview questions for structured interviews';
COMMENT ON TABLE video_interview_evaluations IS 'Human and AI evaluations of interview performance';
COMMENT ON TABLE video_interview_responses IS 'Per-question responses extracted from interview transcripts';
