# Database Migrations

## Quick Start (New Projects)

For a **fresh database setup**, use the consolidated schema file:

```
000_consolidated_schema.sql
```

This single file contains the complete, production-ready database schema including:
- All tables with proper relationships and constraints
- Vector embeddings (pgvector) for resume/job matching
- Multi-tenant organization support
- Row Level Security (RLS) policies
- Indexes for performance
- Functions and triggers
- Seed data (default roles, LLM models)

**How to apply:**
1. Open Supabase SQL Editor
2. Copy the contents of `000_consolidated_schema.sql`
3. Execute the entire file
4. Verify completion (should see ~50+ tables/views created)

---

## Migration History (Reference)

The numbered migration files (001–042) represent the schema evolution history:

| Range | Purpose |
|-------|---------|
| 001–003 | Core schema, roles, vector functions |
| 004–008 | Metadata expansion, type fixes |
| 010–015 | Coding interviews, multi-language support |
| 016–020 | Voice screening system |
| 021–023 | Employment bond/signature features |
| 024–027 | Candidate pipeline, job linking |
| 028–032 | Multi-tenant organizations |
| 034–035 | Voice disconnect tracking, org join links |
| 036 | Removal of video interview tables |
| 037 | Coding answers evaluator FK fix |
| 038–039 | Batch system (created then removed) |
| 040 | Pipeline org_id for multi-tenancy |
| 041 | Hiring campaigns system |
| 042 | Fix campaign candidates summary return types |

These files are kept for:
- Understanding schema evolution
- Reference when debugging
- Incremental updates to existing databases

---

## For Existing Databases

If you're updating an existing database, determine which migration you last applied and run subsequent migrations **in order**.

**Example:** If you're on migration 032, run:
```
034_voice_disconnect_tracking.sql
035_org_join_link.sql
036_remove_video_interviews.sql
037_fix_coding_answers_evaluator_fkey.sql
040_pipeline_add_org_id.sql
041_create_hiring_campaigns.sql
042_fix_campaign_candidates_summary.sql
```

Note: Migrations 038 and 039 (batch system) were created then removed, so they are excluded from the list.

---

## Schema Overview

**Core System:**
- users, roles, user_roles, audit_logs, llm_models

**Multi-Tenancy:**
- organizations, organization_members, organization_invitations

**Resume Matching (pgvector):**
- job_descriptions (with embeddings, pipeline settings)
- resumes (with embeddings, skill extraction)

**Test Evaluation:**
- tests, questions, answer_sheets, answer_evaluations

**Coding Interviews:**
- coding_interviews (Monaco editor sessions)
- coding_questions, coding_submissions, coding_answers
- session_activities (anti-cheating)
- interview_candidates (pre-registration)

**Voice Screening (Vapi.ai):**
- voice_screening_campaigns (AI config, knowledge base)
- voice_candidates
- voice_call_history (transcripts, AI analysis)

**Unified Pipeline:**
- pipeline_candidates (resume → coding → voice lifecycle)
- hiring_campaigns (organize candidates by hiring drive)

---

## Notes

- **No migration runner:** All migrations are plain SQL executed manually
- **Video interviews removed:** Migration 036 drops all video interview tables
- **org_id everywhere:** Multi-tenancy added in migrations 028–030, 040
- **Soft deletes:** deleted_at columns added in migration 031
- **Vector search:** pgvector extension required for resume matching
- **Hiring campaigns:** Added in migration 041 for organizing candidates
- **Campaign report fix:** Migration 042 fixes candidates summary return types
