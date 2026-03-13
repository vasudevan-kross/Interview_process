-- Migration: Vector similarity search functions
-- Description: Add PostgreSQL functions for vector similarity matching
-- Dependencies: Requires 001_initial_schema.sql and pgvector extension

-- Function to find resumes matching a job description
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
        r.resume_text,
        r.match_score,
        r.match_details,
        r.skills_extracted,
        r.file_name,
        r.created_at,
        1 - (r.embedding <=> query_embedding) as similarity
    FROM resumes r
    WHERE r.embedding IS NOT NULL
        AND 1 - (r.embedding <=> query_embedding) > match_threshold
    ORDER BY r.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to find job descriptions matching a resume
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
        jd.skills_required,
        jd.file_name,
        jd.created_at,
        1 - (jd.embedding <=> query_embedding) as similarity
    FROM job_descriptions jd
    WHERE jd.embedding IS NOT NULL
        AND 1 - (jd.embedding <=> query_embedding) > match_threshold
    ORDER BY jd.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to get similar resumes (for deduplication or finding similar candidates)
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
    -- Get the embedding of the target resume
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

-- Function to batch update match scores for all resumes of a job
CREATE OR REPLACE FUNCTION recalculate_match_scores(job_description_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
    updated_count int := 0;
    job_embedding vector(768);
    resume_record record;
    calculated_similarity float;
BEGIN
    -- Get the job description embedding
    SELECT embedding INTO job_embedding
    FROM job_descriptions
    WHERE id = job_description_id;

    IF job_embedding IS NULL THEN
        RAISE EXCEPTION 'Job description not found or has no embedding: %', job_description_id;
    END IF;

    -- Update all resumes for this job
    FOR resume_record IN
        SELECT id, embedding
        FROM resumes
        WHERE job_id = job_description_id AND embedding IS NOT NULL
    LOOP
        calculated_similarity := 1 - (resume_record.embedding <=> job_embedding);

        -- Update match_score (convert to 0-100 scale)
        UPDATE resumes
        SET match_score = calculated_similarity * 100
        WHERE id = resume_record.id;

        updated_count := updated_count + 1;
    END LOOP;

    RETURN updated_count;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION match_resumes_to_job IS 'Find resumes similar to a job description using cosine similarity';
COMMENT ON FUNCTION match_jobs_to_resume IS 'Find job descriptions similar to a resume using cosine similarity';
COMMENT ON FUNCTION find_similar_resumes IS 'Find resumes similar to a target resume (for deduplication)';
COMMENT ON FUNCTION recalculate_match_scores IS 'Recalculate match scores for all resumes of a specific job';

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION match_resumes_to_job TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_to_resume TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_resumes TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_match_scores TO authenticated;
