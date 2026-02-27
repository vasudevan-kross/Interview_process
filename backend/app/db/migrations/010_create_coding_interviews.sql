-- Migration: Create Coding Interview System Tables
-- Description: Creates tables for coding and testing/QA interviews with time-bound access,
--              anti-cheating tracking, and LLM-based evaluation
-- Author: Claude Code
-- Date: 2026-02-26

-- ====================================================================
-- Table 1: coding_interviews (Main interview record)
-- ====================================================================
CREATE TABLE IF NOT EXISTS coding_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Scheduling
    scheduled_start_time TIMESTAMP NOT NULL,
    scheduled_end_time TIMESTAMP NOT NULL,
    grace_period_minutes INTEGER DEFAULT 15,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'scheduled',  -- scheduled, in_progress, completed, expired
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Link generation
    access_token VARCHAR(255) UNIQUE NOT NULL,  -- Shareable link token
    link_expires_at TIMESTAMP NOT NULL,  -- scheduled_end_time + grace_period

    -- Interview type
    interview_type VARCHAR(50) DEFAULT 'coding',  -- coding, testing, both

    -- Configuration
    programming_language VARCHAR(50) DEFAULT 'python',  -- python, javascript, java, selenium-python, etc.
    total_marks INTEGER,

    -- Metadata
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Indexes for coding_interviews
CREATE INDEX idx_coding_interviews_status ON coding_interviews(status);
CREATE INDEX idx_coding_interviews_access_token ON coding_interviews(access_token);
CREATE INDEX idx_coding_interviews_created_by ON coding_interviews(created_by);
CREATE INDEX idx_coding_interviews_interview_type ON coding_interviews(interview_type);

-- ====================================================================
-- Table 2: coding_questions (Coding/Testing problems)
-- ====================================================================
CREATE TABLE IF NOT EXISTS coding_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES coding_interviews(id) ON DELETE CASCADE NOT NULL,
    question_number INTEGER NOT NULL,

    -- Question content
    question_text TEXT NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'medium',  -- easy, medium, hard
    marks INTEGER NOT NULL,

    -- Code scaffolding
    starter_code TEXT,  -- Pre-filled code template
    solution_code TEXT,  -- Reference solution (visible to interviewer only)

    -- Test cases (for LLM evaluation)
    test_cases JSONB,  -- [{input: "...", expected_output: "..."}, ...]

    -- Metadata
    topics VARCHAR(255)[],  -- ['arrays', 'sorting', 'algorithms']
    time_estimate_minutes INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(interview_id, question_number)
);

-- Indexes for coding_questions
CREATE INDEX idx_coding_questions_interview ON coding_questions(interview_id);
CREATE INDEX idx_coding_questions_difficulty ON coding_questions(difficulty);

-- ====================================================================
-- Table 3: coding_submissions (Candidate submissions)
-- ====================================================================
CREATE TABLE IF NOT EXISTS coding_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES coding_interviews(id) ON DELETE CASCADE NOT NULL,

    -- Candidate info
    candidate_name VARCHAR(255) NOT NULL,
    candidate_email VARCHAR(255) NOT NULL,
    candidate_phone VARCHAR(50),

    -- Submission tracking
    started_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'in_progress',  -- in_progress, submitted, auto_submitted, abandoned

    -- Scoring
    total_marks_obtained DECIMAL(10, 2),
    percentage DECIMAL(5, 2),

    -- Session metadata
    ip_address INET,
    user_agent TEXT,
    session_duration_seconds INTEGER,

    -- Flags
    late_submission BOOLEAN DEFAULT false,  -- Submitted after grace period
    suspicious_activity BOOLEAN DEFAULT false,  -- Flagged by anti-cheating

    -- Resume upload (NEW)
    resume_path VARCHAR(500),
    resume_uploaded_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);

-- Indexes for coding_submissions
CREATE INDEX idx_coding_submissions_interview ON coding_submissions(interview_id);
CREATE INDEX idx_coding_submissions_status ON coding_submissions(status);
CREATE INDEX idx_coding_submissions_email ON coding_submissions(candidate_email);
CREATE INDEX idx_coding_submissions_suspicious ON coding_submissions(suspicious_activity);

-- ====================================================================
-- Table 4: coding_answers (Per-question code submissions)
-- ====================================================================
CREATE TABLE IF NOT EXISTS coding_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES coding_submissions(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES coding_questions(id) ON DELETE CASCADE NOT NULL,

    -- Code submission
    submitted_code TEXT,
    programming_language VARCHAR(50),

    -- Evaluation
    marks_awarded DECIMAL(10, 2),
    is_correct BOOLEAN DEFAULT false,
    similarity_score DECIMAL(5, 2),  -- LLM-based similarity to solution

    -- Feedback
    feedback TEXT,
    key_points_covered TEXT[],
    key_points_missed TEXT[],
    code_quality_score DECIMAL(5, 2),  -- Style, readability, efficiency

    -- Metadata
    evaluated_at TIMESTAMP,
    evaluated_by_model VARCHAR(100),  -- Which LLM evaluated
    evaluator_id UUID REFERENCES users(id),  -- Manual review by interviewer
    evaluator_notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(submission_id, question_id)
);

-- Indexes for coding_answers
CREATE INDEX idx_coding_answers_submission ON coding_answers(submission_id);
CREATE INDEX idx_coding_answers_question ON coding_answers(question_id);
CREATE INDEX idx_coding_answers_is_correct ON coding_answers(is_correct);

-- ====================================================================
-- Table 5: session_activities (Anti-cheating event log)
-- ====================================================================
CREATE TABLE IF NOT EXISTS session_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES coding_submissions(id) ON DELETE CASCADE NOT NULL,

    -- Activity tracking
    activity_type VARCHAR(50) NOT NULL,  -- tab_switch, copy, paste, blur, focus, code_change
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Context
    question_id UUID REFERENCES coding_questions(id),
    metadata JSONB,  -- {from_tab: "...", to_tab: "...", code_length: 123, etc.}

    -- Analysis
    flagged BOOLEAN DEFAULT false,  -- Marked as suspicious
    severity VARCHAR(20) DEFAULT 'low'  -- low, medium, high
);

-- Indexes for session_activities
CREATE INDEX idx_session_activities_submission ON session_activities(submission_id);
CREATE INDEX idx_session_activities_type ON session_activities(activity_type);
CREATE INDEX idx_session_activities_flagged ON session_activities(flagged);
CREATE INDEX idx_session_activities_timestamp ON session_activities(timestamp);

-- ====================================================================
-- Row-Level Security (RLS) Policies
-- ====================================================================

-- Enable RLS on all tables
ALTER TABLE coding_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_activities ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- Policies for coding_interviews
-- ====================================================================

-- Interviewers can view interviews they created
CREATE POLICY coding_interviews_select_policy ON coding_interviews
    FOR SELECT
    USING (created_by = auth.uid());

-- Interviewers can create interviews
CREATE POLICY coding_interviews_insert_policy ON coding_interviews
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- Interviewers can update their own interviews
CREATE POLICY coding_interviews_update_policy ON coding_interviews
    FOR UPDATE
    USING (created_by = auth.uid());

-- Interviewers can delete their own interviews
CREATE POLICY coding_interviews_delete_policy ON coding_interviews
    FOR DELETE
    USING (created_by = auth.uid());

-- ====================================================================
-- Policies for coding_questions
-- ====================================================================

-- Interviewers can view questions for their interviews
CREATE POLICY coding_questions_select_policy ON coding_questions
    FOR SELECT
    USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- Interviewers can insert questions for their interviews
CREATE POLICY coding_questions_insert_policy ON coding_questions
    FOR INSERT
    WITH CHECK (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- Interviewers can update questions for their interviews
CREATE POLICY coding_questions_update_policy ON coding_questions
    FOR UPDATE
    USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- Interviewers can delete questions for their interviews
CREATE POLICY coding_questions_delete_policy ON coding_questions
    FOR DELETE
    USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- ====================================================================
-- Policies for coding_submissions
-- ====================================================================

-- Interviewers can view submissions for their interviews
CREATE POLICY coding_submissions_select_policy ON coding_submissions
    FOR SELECT
    USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- Anyone (candidates) can create submissions (public access via access_token)
CREATE POLICY coding_submissions_insert_policy ON coding_submissions
    FOR INSERT
    WITH CHECK (true);

-- Submissions can be updated by the interview creator or system
CREATE POLICY coding_submissions_update_policy ON coding_submissions
    FOR UPDATE
    USING (
        interview_id IN (
            SELECT id FROM coding_interviews WHERE created_by = auth.uid()
        )
    );

-- ====================================================================
-- Policies for coding_answers
-- ====================================================================

-- Interviewers can view answers for submissions in their interviews
CREATE POLICY coding_answers_select_policy ON coding_answers
    FOR SELECT
    USING (
        submission_id IN (
            SELECT id FROM coding_submissions
            WHERE interview_id IN (
                SELECT id FROM coding_interviews WHERE created_by = auth.uid()
            )
        )
    );

-- Anyone (candidates) can insert answers
CREATE POLICY coding_answers_insert_policy ON coding_answers
    FOR INSERT
    WITH CHECK (true);

-- Anyone (candidates) can update their own answers (for auto-save)
CREATE POLICY coding_answers_update_policy ON coding_answers
    FOR UPDATE
    USING (true);

-- ====================================================================
-- Policies for session_activities
-- ====================================================================

-- Interviewers can view activities for submissions in their interviews
CREATE POLICY session_activities_select_policy ON session_activities
    FOR SELECT
    USING (
        submission_id IN (
            SELECT id FROM coding_submissions
            WHERE interview_id IN (
                SELECT id FROM coding_interviews WHERE created_by = auth.uid()
            )
        )
    );

-- Anyone (candidates) can insert activities
CREATE POLICY session_activities_insert_policy ON session_activities
    FOR INSERT
    WITH CHECK (true);

-- ====================================================================
-- Functions and Triggers
-- ====================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for coding_interviews
CREATE TRIGGER update_coding_interviews_updated_at BEFORE UPDATE ON coding_interviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for coding_answers
CREATE TRIGGER update_coding_answers_updated_at BEFORE UPDATE ON coding_answers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Comments for documentation
-- ====================================================================

COMMENT ON TABLE coding_interviews IS 'Stores coding and testing/QA interview sessions with time-bound access';
COMMENT ON TABLE coding_questions IS 'Stores interview questions with starter code and test cases';
COMMENT ON TABLE coding_submissions IS 'Tracks candidate submissions and session metadata';
COMMENT ON TABLE coding_answers IS 'Stores per-question code submissions and evaluations';
COMMENT ON TABLE session_activities IS 'Anti-cheating event log for tracking tab switches, copy/paste, etc.';

COMMENT ON COLUMN coding_interviews.access_token IS 'Unique token for shareable candidate link';
COMMENT ON COLUMN coding_interviews.interview_type IS 'Type: coding, testing, or both';
COMMENT ON COLUMN coding_submissions.suspicious_activity IS 'Flagged by anti-cheating system';
COMMENT ON COLUMN coding_submissions.resume_path IS 'Path to uploaded resume (optional)';
COMMENT ON COLUMN session_activities.activity_type IS 'tab_switch, copy, paste, blur, focus, code_change';

-- ====================================================================
-- Migration Complete
-- ====================================================================

-- Verify tables created
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_name LIKE 'coding_%' OR table_name = 'session_activities'
ORDER BY table_name;
