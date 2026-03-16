# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (FastAPI, Python)
```bash
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API available at `http://localhost:8000` — interactive docs at `/docs` (only when `DEBUG=True`).

### Frontend (Next.js)
```bash
cd frontend
npm install --legacy-peer-deps   # legacy flag is required
npm run dev                       # http://localhost:3000
npm run build && npm run start    # production
npm run lint
```

### Infrastructure (Ollama LLM + Redis)
```bash
docker compose up -d   # starts Ollama on :11434 and Redis on :6379
ollama pull qwen2.5:7b && ollama pull glm-ocr   # required models
# qwen2.5:7b - superior reasoning and JSON generation (~4.7GB)
# glm-ocr - #1 ranked OCR model, 128K context (2.2GB)
```

### Environment
Copy `backend/.env.example` → `backend/.env` and fill in:
- `SUPABASE_URL`, `SUPABASE_KEY` (service role), `SUPABASE_ANON_KEY`
- `SECRET_KEY` (min 32 chars)
- `DAILY_API_KEY` (video interviews, optional)
- `VAPI_PRIVATE_KEY` / `VAPI_ASSISTANT_ID` (voice screening, optional)
- `GMAIL_APP_PASSWORD` (transactional email, optional)

`DEBUG=True` in `.env` disables JWT enforcement — the backend falls back to `SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000000"` for unauthenticated requests during local development.

### Database Setup & Migrations

**For new projects (recommended):**
Run the single consolidated schema file in Supabase SQL editor:
```sql
-- backend/migrations/000_consolidated_schema.sql
```
This file contains the complete, up-to-date database schema including all tables, indexes, RLS policies, functions, triggers, and seed data.

**For existing projects or incremental updates:**
Individual migration files (numbered 001–036) are kept in `backend/migrations/` for reference and can be run sequentially. The consolidated file (`000_consolidated_schema.sql`) represents the final state after all migrations.

**Note:** There is no migration runner script — all migrations are plain SQL executed manually in Supabase's SQL editor.

---

## Architecture

### Stack
- **Backend:** FastAPI 0.115 + Pydantic v2 Settings, running on Uvicorn
- **Frontend:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL + pgvector + Auth + Storage)
- **LLM:** Ollama (local) — default model `qwen2.5:7b`, vision/OCR model `glm-ocr`
- **Video:** Daily.co (`@daily-co/daily-js`)
- **Voice AI:** Vapi.ai (`@vapi-ai/web`)

### Backend API Structure
All routes are under `/api/v1/` and registered in `backend/app/api/v1/__init__.py`:

| Router file | Prefix / purpose |
|---|---|
| `common.py` | Health, auth, shared endpoints |
| `resume_matching.py` | Job descriptions + resume upload & scoring |
| `test_evaluation.py` / `test_evaluation_batch.py` | Answer sheet grading |
| `video_interviews.py` | Daily.co room lifecycle |
| `coding_interviews.py` | Monaco editor sessions |
| `voice_screening.py` | Vapi campaign management |
| `pipeline.py` | Candidate pipeline CRUD |
| `organizations.py` | Multi-tenant org & member management |

`resume_matching` is loaded with a `try/except` so the server still starts if PyTorch/sentence-transformers are missing.

### Authentication & Multi-tenancy
1. Frontend obtains a Supabase JWT and sends `Authorization: Bearer <token>`.
2. `backend/app/auth/dependencies.py` validates the token via `supabase.auth.get_user(token)` and maps the auth UUID → internal `users` table row.
3. `OrgContextMiddleware` (`backend/app/middleware/org_context.py`) resolves the user's active organization and attaches `org_id` to `request.state`.
4. Permission checks use RBAC defined in `backend/app/auth/permissions.py`: roles are `owner > admin > hr > interviewer > viewer`, and permissions follow the pattern `module:action` (e.g., `resume:view`).

### Resume Matching: Hybrid Scoring
The scoring model in `backend/app/services/resume_matching_llm.py` blends:
- **60% algorithmic** — deterministic skill-overlap score computed by `compute_algorithmic_score()` in the same file (fuzzy alias matching, experience bonus up to +10)
- **40% LLM** — qualitative `match_score` returned by `ResumeParserLLM.match_with_job()` in `resume_parser_llm.py`

All three LLM calls in the pipeline use `temperature=0.1` (near-deterministic) to minimise score variance across repeated uploads:
- `parse_resume()` — skill/info extraction
- `match_with_job()` — qualitative scoring
- `process_job_description()` — required-skill extraction

The `recommendation` label (Strong recommend / Recommend / Consider / Not recommended) is derived **deterministically from the final score**, not from the LLM.

**Content-hash deduplication:** uploading the same file to the same job returns the cached DB row immediately — no LLM calls. SHA-256 of the file bytes is stored in `parsed_data.file_hash` and checked at the top of `process_resume()`.

### Resume Upload UI
`frontend/src/app/dashboard/resume-matching/[jobId]/upload-resumes/page.tsx` uploads files **one at a time** (sequential loop calling `apiClient.uploadResume()`) rather than batching. This gives real-time per-file progress: *"Processing file 3 of 5 — filename.pdf"* with a live progress bar and results list that populates as each file completes. There is no "Skip & View Results" button.

### LLM Orchestration
`backend/app/services/llm_orchestrator.py` is the single gateway for all Ollama calls. It exposes `generate_completion(prompt, temperature=0.7, ...)`. Pass an explicit `temperature` argument when deterministic output matters.

### Frontend Design System
- **Accent / primary CTA:** `bg-indigo-600 hover:bg-indigo-700`
- **Sidebar:** `bg-slate-950 border-slate-800/60`, `w-64`, desktop offset `md:pl-64`
- **Active nav item:** `bg-slate-800 text-white border-l-2 border-indigo-500`
- **Page headers:** use `<PageHeader>` component (`text-xl font-semibold`) — no gradient banners
- **Stat numbers:** `text-2xl font-semibold tabular-nums text-slate-900`
- **Badges:** `rounded-md font-medium` (not `rounded-full`)
- **Table heads:** `text-xs font-medium text-slate-400 uppercase tracking-wider`
- **Loading states:** `SkeletonPageHeader`, `SkeletonStatCards`, `SkeletonTable` from `components/ui/skeleton.tsx`
- **Empty states:** text-only, no icon circles — `py-16 text-center`

### Known Pre-existing TypeScript Errors (ignore, do not fix)
- `src/app/interview/[token]/signature/page.tsx` — signature pad ref type mismatch
- `src/components/coding/CodeEditor.tsx` — missing `@types/monaco-editor`

### Frontend API Proxy
`frontend/next.config.ts` proxies `/api/*` → `http://localhost:8000` so the frontend never calls the backend directly by URL in component code — always use relative `/api/v1/...` paths.

### State Management
- **Server state:** TanStack Query (`@tanstack/react-query`)
- **Org context:** `frontend/src/contexts/OrganizationContext.tsx` + `useOrganization` hook
- **Light global state:** Zustand or Jotai atoms (used sparingly)
