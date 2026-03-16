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

The numbered migration files (001–036) represent the schema evolution history:

| Range | Purpose |
|-------|---------|
| 001–003 | Core schema, roles, vector functions |
| 004–008 | Metadata expansion, type fixes |
| 009 | Video interviews (later removed) |
| 010–015 | Coding interviews, multi-language support |
| 016–020 | Voice screening system |
| 021–023 | Employment bond/signature features |
| 024–027 | Candidate pipeline, job linking |
| 028–032 | Multi-tenant organizations |
| 034–035 | Voice disconnect tracking, org join links |
| 036 | Removal of video interview tables |

These files are kept for:
- Understanding schema evolution
- Reference when debugging
- Incremental updates to existing databases

---

## For Existing Databases

If you're updating an existing database, determine which migration you last applied and run subsequent migrations **in order**.

**Example:** If you're on migration 027, run:
```
028_multi_tenant_orgs.sql
029_multi_tenant_add_org_id.sql
030_multi_tenant_backfill.sql
031_multi_tenant_soft_deletes.sql
032_org_discovery_settings.sql
034_voice_disconnect_tracking.sql
035_org_join_link.sql
036_remove_video_interviews.sql
```

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

---

## Notes

- **No migration runner:** All migrations are plain SQL executed manually
- **Video interviews removed:** Migration 036 drops all video interview tables (009)
- **org_id everywhere:** Multi-tenancy added in migrations 028–030
- **Soft deletes:** deleted_at columns added in migration 031
- **Vector search:** pgvector extension required for resume matching
