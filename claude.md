# Claude.md - AI-Driven Interview Management Platform

## Project Overview

This is a comprehensive, production-ready **AI-Driven Interview Management Platform** built with a modern full-stack architecture. The platform provides end-to-end recruitment workflow automation with 6 major modules: Resume Matching, Test Evaluation, Coding Interviews, Video Interviews, Voice Screening, and Analytics.

**Purpose:** Automate and enhance the entire interview lifecycle from resume screening to final candidate evaluation using AI/LLM technology, OCR, video conferencing, and voice AI.

---

## Architecture

### Tech Stack

**Backend:**
- **Framework:** FastAPI 0.115+ (Python 3.10+)
- **Server:** Uvicorn with hot reload
- **Database:** PostgreSQL via Supabase (with pgvector extension for vector similarity search)
- **LLM:** Ollama (local inference) - Mistral, LLaMA, CodeLlama models
- **OCR:** PaddleOCR (optional), TrOCR for handwritten/printed text recognition
- **Document Processing:** PyPDF2, pdfplumber, python-docx, Pillow, pdf2image
- **Authentication:** Supabase Auth + JWT (python-jose)
- **Storage:** Supabase Storage for documents/videos/recordings
- **Background Jobs:** Redis + Celery (optional)
- **Testing:** pytest, pytest-asyncio

**Frontend:**
- **Framework:** Next.js 15.1.8 (App Router)
- **UI Library:** React 19.0.0
- **Language:** TypeScript 5.7.3
- **Styling:** Tailwind CSS 3.4.17
- **UI Components:** shadcn/ui (Radix UI primitives) - 18 components
- **Forms:** react-hook-form + zod validation
- **State Management:** Zustand, Jotai
- **Data Fetching:** TanStack React Query v5, Axios
- **Video:** @daily-co/daily-react (Daily.co for video conferencing)
- **Voice AI:** @vapi-ai/web (Vapi.ai for phone interviews)
- **Code Editor:** Monaco Editor (@monaco-editor/react)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Animations:** Framer Motion

**Infrastructure:**
- **Database & Auth:** Supabase (PostgreSQL + pgvector + Supabase Auth)
- **LLM Server:** Ollama (Docker container for local LLM inference)
- **Cache:** Redis (Docker, optional)
- **Tunneling:** ngrok (for external webhook access)

---

## Project Structure

```
Interview_process/
├── backend/                         # Python FastAPI Backend
│   ├── app/
│   │   ├── api/v1/                 # REST API endpoints (6 routers)
│   │   │   ├── __init__.py         # Router aggregation
│   │   │   ├── common.py           # Health check, models list
│   │   │   ├── resume_matching.py  # Resume/JD upload, matching API
│   │   │   ├── test_evaluation.py  # Test evaluation API
│   │   │   ├── test_evaluation_batch.py # Batch processing API
│   │   │   ├── coding_interviews.py     # Coding interview API
│   │   │   ├── video_interviews.py      # Video interview API
│   │   │   └── voice_screening.py       # Voice screening API
│   │   ├── services/               # Business logic (15 services, ~7K lines)
│   │   │   ├── llm_orchestrator.py # Multi-model LLM orchestration
│   │   │   ├── test_evaluation.py  # Test evaluation logic
│   │   │   ├── resume_matching.py  # Resume matching logic
│   │   │   ├── coding_interview_service.py
│   │   │   ├── video_interview_service.py
│   │   │   ├── voice_screening_service.py
│   │   │   ├── document_processor.py # PDF/DOCX/Image processing
│   │   │   ├── question_generator.py # AI question generation
│   │   │   ├── storage_service.py  # Supabase Storage interface
│   │   │   └── vector_store.py     # pgvector operations
│   │   ├── schemas/                # Pydantic models (5 files)
│   │   │   ├── resume_matching.py
│   │   │   ├── test_evaluation.py
│   │   │   ├── coding_interviews.py
│   │   │   ├── video_interviews.py
│   │   │   └── voice_screening.py
│   │   ├── db/                     # Database layer
│   │   │   ├── supabase_client.py  # Supabase client singleton
│   │   │   └── migrations/         # SQL migrations (16 files)
│   │   ├── core/                   # Core modules
│   │   ├── auth/                   # Authentication middleware
│   │   ├── models/                 # Data models
│   │   ├── prompts/                # LLM prompt templates
│   │   ├── config.py               # App configuration (Pydantic Settings)
│   │   ├── model_config.py         # LLM model selection strategy
│   │   └── main.py                 # FastAPI app entry point
│   ├── venv/                       # Python virtual environment
│   ├── requirements.txt            # Python dependencies
│   ├── .env.example                # Environment template
│   ├── be.bat                      # Windows startup script
│   └── MODEL_SELECTION.md          # Model selection documentation
├── frontend/                        # Next.js Frontend
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── dashboard/          # Main dashboard pages
│   │   │   │   ├── resume-matching/
│   │   │   │   ├── test-evaluation/
│   │   │   │   ├── coding-interviews/
│   │   │   │   ├── video-interviews/
│   │   │   │   ├── voice-screening/
│   │   │   │   ├── analytics/
│   │   │   │   └── settings/
│   │   │   ├── interview/[token]/  # Public interview pages
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   └── layout.tsx
│   │   ├── components/             # React components
│   │   │   ├── ui/                 # shadcn/ui components (18 files)
│   │   │   ├── dashboard/          # Dashboard-specific components
│   │   │   ├── coding/             # Code editor components
│   │   │   ├── video/              # Video components
│   │   │   ├── test/               # Test components
│   │   │   └── auth/               # Auth guards
│   │   └── lib/                    # Utilities
│   │       ├── api/                # API clients (5 modules)
│   │       ├── supabase/           # Supabase client
│   │       ├── anti-cheating.ts    # Anti-cheating utilities
│   │       └── utils.ts            # Helper functions
│   ├── public/                     # Static assets
│   ├── .env.local.example          # Frontend env template
│   ├── next.config.ts              # Next.js config (API proxy)
│   ├── tailwind.config.ts          # Tailwind theme
│   ├── components.json             # shadcn/ui config
│   ├── package.json                # NPM dependencies
│   └── fe.bat                      # Windows startup script
├── docs/                            # Documentation
│   ├── README.md                   # Docs index
│   ├── setup/                      # Setup guides
│   │   ├── COMPLETE_SETUP.md       # Full installation guide
│   │   └── role-setup.md           # User roles & permissions
│   ├── features/                   # Feature documentation
│   │   ├── video-interviews.md
│   │   ├── daily-co-integration.md
│   │   └── batch-test-evaluation.md
│   ├── guides/                     # How-to guides
│   │   └── daily-co-migration.md
│   └── troubleshooting/            # Troubleshooting docs
│       ├── json-parsing-fix.md
│       ├── supabase-lock-timeout.md
│       ├── identical-scores-fix.md
│       └── empty-answers-scoring.md
├── docker-compose.yml              # Ollama + Redis services
├── start-ngrok.bat                 # ngrok tunnel setup
├── Readme.Md                       # Project README
├── .gitignore                      # Git ignore rules
└── claude.md                       # This file
```

---

## Core Features

### 1. Resume Matching (AI-Powered)

**Location:** `backend/app/api/v1/resume_matching.py`, `backend/app/services/resume_matching.py`

**Features:**
- Upload job descriptions (PDF/DOCX/TXT)
- Upload resumes (PDF/DOCX/images)
- Batch resume processing (multiple resumes per job)
- AI-powered skill extraction using LLM
- Hybrid scoring system (semantic + keyword matching)
- Vector similarity search with pgvector
- Ranked candidate lists with match scores
- Bulk delete functionality

**Technology:**
- Document parsing: PyPDF2, pdfplumber, python-docx
- Embeddings: sentence-transformers (optional - requires PyTorch)
- Vector search: pgvector (PostgreSQL extension)
- LLM: Mistral:7b (skill extraction), LLaMA:13b (evaluation)

**Status:** ✅ Complete (optional - requires PyTorch installation)

### 2. Test Evaluation (Automated Grading)

**Location:** `backend/app/api/v1/test_evaluation.py`, `backend/app/api/v1/test_evaluation_batch.py`

**Features:**
- Upload question papers (PDF/DOCX/TXT)
- Upload answer sheets (PDF/images - handwritten or printed)
- OCR for handwritten text (PaddleOCR)
- AI-powered answer evaluation with partial credit scoring
- Multi-strategy JSON parsing (robust error handling)
- Batch processing (20-50 papers in parallel)
- Real-time progress tracking
- Domain-specific model selection (coding, general, testing, devops)
- Detailed score reports

**Technology:**
- OCR: PaddleOCR, TrOCR (optional)
- Document processing: PyPDF2, pdfplumber, pdf2image
- LLM: Mistral:7b (parsing), LLaMA:13b (evaluation), CodeLlama:7b (coding questions)
- Batch processing: asyncio with semaphore (5 concurrent papers)

**Performance:** 80% faster with batch processing vs sequential

**Status:** ✅ Complete

### 3. Coding Interviews (Live Coding Platform)

**Location:** `backend/app/api/v1/coding_interviews.py`, `backend/app/services/coding_interview_service.py`

**Features:**
- AI question generation using CodeLlama
- Multi-language support (Python, Java, JavaScript, C++, C#, Go, Rust, TypeScript, SQL, Bash)
- Monaco code editor integration (VS Code-like experience)
- Auto-save functionality (30-second intervals)
- Anti-cheating monitoring (tab switches, copy-paste, visibility changes)
- Time-bounded submissions with grace period (configurable)
- Code evaluation and scoring
- Support for testing framework questions (Selenium, Pytest, Jest, JUnit, etc.)
- Activity tracking and logging

**Technology:**
- Code editor: Monaco Editor (@monaco-editor/react)
- LLM: CodeLlama:7b (question generation, code evaluation)
- Anti-cheating: Browser visibility API, clipboard monitoring
- Database: Supabase (code storage, activity logs)

**Configuration:**
- `CODING_INTERVIEW_DEFAULT_GRACE_PERIOD`: 15 minutes
- `CODING_INTERVIEW_AUTO_SAVE_INTERVAL`: 30 seconds
- `CODING_INTERVIEW_MAX_DURATION`: 240 minutes (4 hours)
- `QUESTION_GENERATION_MODEL`: codellama:7b
- `QUESTION_GENERATION_TEMPERATURE`: 0.7

**Status:** ✅ Complete

### 4. Video Interviews (Live Panel Interviews)

**Location:** `backend/app/api/v1/video_interviews.py`, `backend/app/services/video_interview_service.py`

**Features:**
- Daily.co integration (no credit card required, 10K free minutes/month)
- Schedule interviews with multiple interviewers
- Live HD video/audio sessions (WebRTC-based)
- Screen sharing
- Cloud recording to Supabase Storage
- Participant grid layout
- Recording playback
- Webhook handling for events (recording.ready, participant.joined, etc.)
- Interview status tracking

**Technology:**
- Video platform: Daily.co (@daily-co/daily-react)
- Storage: Supabase Storage (recordings)
- Webhooks: FastAPI endpoints for Daily.co callbacks
- Database: Supabase (interview metadata, participant tracking)

**Migration:** Migrated from 100ms to Daily.co (see `docs/guides/daily-co-migration.md`)

**Status:** ✅ Complete

### 5. Voice Screening (AI Phone Interviews)

**Location:** `backend/app/api/v1/voice_screening.py`, `backend/app/services/voice_screening_service.py`

**Features:**
- Vapi.ai integration for voice interviews
- Adaptive questioning (fresher vs experienced candidates)
- Structured data extraction (24 fields including experience, skills, availability)
- Bulk candidate import (CSV/Excel)
- Webhook handling for call reports
- Excel export functionality
- Interview status tracking (pending, in_progress, completed, failed)

**Technology:**
- Voice AI: Vapi.ai (@vapi-ai/web)
- Data processing: pandas, openpyxl (Excel export)
- Webhooks: FastAPI endpoints for Vapi callbacks
- Database: Supabase (candidate data, call reports)

**Configuration:**
- `VAPI_PRIVATE_KEY`: API key for Vapi.ai
- `VAPI_ASSISTANT_ID`: Voice assistant configuration ID

**Status:** ✅ Complete

### 6. Analytics Dashboard

**Location:** `frontend/src/app/dashboard/analytics/`

**Features:**
- Real-time statistics (jobs, resumes, tests, interviews)
- Score distribution charts
- Recent activity tracking
- Role-based access (admin/recruiter)
- Visual charts using Recharts

**Status:** ✅ Complete

---

## LLM Model Strategy

The platform uses **task-based model selection** to optimize for speed, accuracy, and specialization.

**Model Assignments:**

| Task | Model | Reason |
|------|-------|--------|
| Question parsing | Mistral:7b | Fast, good at structured extraction |
| Resume parsing | Mistral:7b | Fast, good enough for data extraction |
| JD parsing | Mistral:7b | Fast, good at extracting requirements |
| Skill extraction | Mistral:7b | Quick keyword extraction |
| Answer evaluation | LLaMA:13b | Better reasoning for partial credit |
| Resume matching | LLaMA:13b | Deeper understanding needed |
| Code evaluation | CodeLlama:7b | Specialized for code understanding |
| Code generation | CodeLlama:7b | Better code structure understanding |

**Domain-Specific Overrides:**

| Domain | Model Override |
|--------|---------------|
| coding | CodeLlama:7b |
| development | CodeLlama:7b |
| sql | CodeLlama:7b |
| general | LLaMA:13b |
| testing | LLaMA:13b |
| devops | LLaMA:13b |

**Configuration:** See `backend/MODEL_SELECTION.md` and `backend/app/model_config.py`

---

## Database Schema

**Key Tables:**

1. **users** - User accounts (Supabase Auth)
2. **roles** - User roles (admin, recruiter, interviewer, candidate)
3. **user_roles** - Role assignments
4. **job_descriptions** - Job postings
5. **resumes** - Candidate resumes with embeddings
6. **tests** - Question papers
7. **answer_sheets** - Student answer sheets
8. **coding_interviews** - Coding interview sessions
9. **coding_questions** - Generated coding questions
10. **coding_submissions** - Code submissions
11. **session_activities** - Anti-cheating activity logs
12. **video_interviews** - Video interview sessions
13. **interview_participants** - Participant tracking
14. **voice_screening_candidates** - Voice interview candidates

**Migrations:** 16 SQL migrations in `backend/app/db/migrations/`

**Vector Search:** pgvector extension with custom functions for similarity search

---

## API Endpoints

**Base URL:** `http://localhost:8000/api/v1`

### Common
- `GET /health` - Health check
- `GET /common/models` - List available Ollama models

### Resume Matching
- `POST /resume-matching/job-description` - Upload job description
- `POST /resume-matching/resume` - Upload single resume
- `POST /resume-matching/resumes/batch` - Batch upload resumes
- `GET /resume-matching/job/{id}/candidates` - Get ranked candidates
- `GET /resume-matching/job/{id}/statistics` - Get matching statistics
- `DELETE /resume-matching/resumes` - Bulk delete resumes

### Test Evaluation
- `POST /test-evaluation/question-paper` - Upload question paper
- `POST /test-evaluation/answer-sheet` - Upload answer sheet
- `POST /test-evaluation/batch/upload` - Batch upload (20-50 papers)
- `GET /test-evaluation/batch/status/{id}` - Get batch processing status
- `GET /test-evaluation/batch/results/{id}` - Get batch results
- `GET /test-evaluation/test/{id}/results` - Get test results
- `DELETE /test-evaluation/answer-sheets` - Bulk delete answer sheets

### Coding Interviews
- `POST /coding-interviews` - Create coding interview
- `POST /coding-interviews/generate-questions` - Generate AI questions
- `POST /coding-interviews/start` - Start interview submission
- `POST /coding-interviews/save-code` - Auto-save code
- `POST /coding-interviews/submit` - Submit interview
- `POST /coding-interviews/track-activity` - Track anti-cheating events

### Video Interviews
- `POST /video-interviews/schedule` - Schedule interview
- `GET /video-interviews/{id}` - Get interview details
- `GET /video-interviews` - List interviews
- `POST /video-interviews/webhooks/*` - Daily.co webhooks

### Voice Screening
- `POST /voice-screening/candidates` - Create candidate
- `POST /voice-screening/candidates/bulk` - Bulk create candidates
- `POST /voice-screening/candidates/upload` - Upload CSV/Excel
- `GET /voice-screening/candidates` - List candidates
- `POST /voice-screening/webhook` - Vapi.ai webhook
- `GET /voice-screening/export` - Export to Excel

---

## Environment Configuration

### Backend (.env)

```bash
# Application
APP_NAME="Interview Management API"
DEBUG=True

# Database
DB_TYPE=supabase
VECTOR_DB=pgvector

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Storage
STORAGE_TYPE=supabase
UPLOAD_DIR=./uploads

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_OLLAMA_MODEL=mistral:7b
OLLAMA_OCR_MODEL=MedAIBase/PaddleOCR-VL:0.9b
OLLAMA_FALLBACK_MODEL=glm-ocr:latest

# PaddleOCR
PADDLEOCR_ENABLED=True
PADDLEOCR_LANG=en
PADDLEOCR_USE_GPU=False

# OCR Strategy
OCR_STRATEGY=auto  # auto, paddleocr, ollama

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Security
SECRET_KEY=your-secret-key-change-this
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# File Upload
MAX_UPLOAD_SIZE=10485760  # 10MB
ALLOWED_EXTENSIONS=pdf,docx,doc,txt,png,jpg,jpeg

# CORS
ALLOWED_ORIGINS=http://localhost:3000

# Daily.co Video
DAILY_API_KEY=your-daily-api-key
DAILY_DOMAIN=your-domain.daily.co  # optional
ENABLE_VIDEO_INTERVIEWS=True
MAX_VIDEO_SIZE_MB=5000
VIDEO_STORAGE_BUCKET=interview-recordings
ENABLE_AI_VIDEO_ANALYSIS=True
ALLOWED_VIDEO_FORMATS=mp4,webm,mov

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Coding Interviews
CODING_INTERVIEW_DEFAULT_GRACE_PERIOD=15  # minutes
CODING_INTERVIEW_AUTO_SAVE_INTERVAL=30    # seconds
CODING_INTERVIEW_MAX_DURATION=240         # minutes
QUESTION_GENERATION_MODEL=codellama:7b
QUESTION_GENERATION_TEMPERATURE=0.7

# Vapi Voice Screening
VAPI_PRIVATE_KEY=your-vapi-private-key
VAPI_ASSISTANT_ID=your-assistant-id
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Installation & Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- Docker (for Ollama, Redis)
- Supabase account
- Daily.co account (free tier)
- Vapi.ai account (for voice screening)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Interview_process
   ```

2. **Start Ollama & Redis (Docker)**
   ```bash
   docker-compose up -d
   ```

3. **Pull Ollama models**
   ```bash
   ollama pull mistral:7b
   ollama pull llama2:7b
   ollama pull llama2:13b
   ollama pull codellama:7b
   ```

4. **Setup Supabase**
   - Create a Supabase project
   - Run migrations from `backend/app/db/migrations/`
   - Get URL and keys (service_role, anon)

5. **Backend Setup**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your configuration

   # On Windows:
   ./be.bat

   # On Linux/Mac:
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

6. **Frontend Setup**
   ```bash
   cd frontend
   cp .env.local.example .env.local
   # Edit .env.local with your configuration

   # On Windows:
   ./fe.bat

   # On Linux/Mac:
   npm install --legacy-peer-deps
   npm run dev
   ```

7. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Optional: ngrok for External Webhooks

```bash
# Windows:
./start-ngrok.bat

# This will start ngrok and auto-update backend .env with public URL
```

---

## Development Scripts

### Windows Scripts

- **`backend/be.bat`** - Start backend (venv activation, pip install, uvicorn)
- **`frontend/fe.bat`** - Start frontend (npm install, npm run dev)
- **`start-ngrok.bat`** - Start ngrok tunnel and update .env

### NPM Scripts (Frontend)

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

---

## Testing

```bash
cd backend
pytest                          # Run all tests
pytest --cov                    # Run with coverage
pytest tests/test_llm.py       # Run specific test file
```

---

## Architecture Patterns

### Backend Patterns
- **Service-oriented architecture** - Separation of concerns (API ↔ Service ↔ DB)
- **Dependency injection** - Service factory functions
- **Repository pattern** - Supabase client abstraction
- **Factory pattern** - `get_*_service()` functions
- **Strategy pattern** - OCR strategy, model selection

### Frontend Patterns
- **Component-driven development** - Reusable UI components
- **Server/Client component separation** - Next.js App Router
- **Custom hooks** - Data fetching, form handling
- **API proxy pattern** - Next.js rewrites for CORS
- **Form validation** - Zod schemas with react-hook-form

### Database Patterns
- **Normalized schema** - Foreign keys, relationships
- **Vector embeddings** - pgvector for semantic search
- **Row-level security** - Supabase RLS policies
- **Audit trails** - created_at, updated_at timestamps
- **Soft deletes** - Logical deletion where applicable

---

## Advanced Features

### Anti-Cheating System
- Tab switch detection (Visibility API)
- Copy-paste monitoring (Clipboard API)
- Time tracking (submission timestamps)
- Activity logging (session_activities table)
- Browser visibility detection

### Batch Processing
- Parallel processing (5 concurrent papers using asyncio)
- Real-time progress tracking (batch status API)
- Robust error handling (individual paper failures don't stop batch)
- 80% time savings vs sequential processing

### Robust JSON Parsing
- Multi-strategy extraction (regex patterns, markdown code blocks)
- Automatic repair of malformed JSON (trailing commas, missing quotes)
- Graceful fallbacks (return empty structure if parsing fails)
- Logging for debugging

### Model Performance Tracking
- Model selection logging
- Task-based routing
- Domain-aware selection
- Fallback mechanisms

---

## External Integrations

1. **Supabase** - Database, Auth, Storage
   - PostgreSQL with pgvector
   - Supabase Auth for user management
   - Supabase Storage for files/videos

2. **Ollama** - Local LLM inference
   - http://localhost:11434
   - Multiple models (Mistral, LLaMA, CodeLlama)
   - No API costs, full control

3. **Daily.co** - Video conferencing
   - 10K free minutes/month (no credit card)
   - HD video/audio
   - Cloud recording
   - Screen sharing

4. **Vapi.ai** - Voice AI phone interviews
   - Natural voice conversations
   - Structured data extraction
   - Webhook callbacks

5. **ngrok** - Public URL tunneling
   - Webhook delivery
   - External access to local dev environment

---

## Project Metrics

- **Backend Services:** 15 files, ~7,000 lines of Python
- **Frontend Components:** 67 TypeScript/React files
- **API Endpoints:** 40+ REST endpoints across 6 modules
- **Database Migrations:** 16 SQL files
- **Documentation:** 12+ markdown files
- **UI Components:** 18 shadcn/ui components (Radix UI)
- **Supported File Formats:** PDF, DOCX, TXT, JPG, PNG, CSV, XLSX
- **Programming Languages (Coding Interviews):** 10+ languages
- **Total Lines of Code:** ~15,000+ (backend + frontend)

---

## Documentation

- **README.md** - Project overview
- **docs/setup/COMPLETE_SETUP.md** - Full installation guide
- **docs/setup/role-setup.md** - User roles & permissions
- **docs/features/** - Feature-specific documentation
- **docs/guides/** - Migration and how-to guides
- **docs/troubleshooting/** - Common issues and fixes
- **backend/MODEL_SELECTION.md** - LLM model selection strategy
- **API Docs** - Auto-generated at /docs (FastAPI Swagger UI)

---

## Known Issues & Troubleshooting

See `docs/troubleshooting/` for:
- JSON parsing errors
- Supabase lock timeout issues
- Identical scores bug
- Empty answers scoring
- Model not found errors

---

## Future Roadmap

- ⏳ AI Transcription - Automatic interview transcription
- ⏳ User-selectable models - Frontend model selection
- ⏳ Dynamic model selection - GPU/availability-based routing
- ⏳ A/B testing - Model quality comparison
- ⏳ Model caching - Pre-load frequently used models
- ⏳ Hybrid approach - Fast model → capable model escalation

---

## Status Summary

| Module | Status | Notes |
|--------|--------|-------|
| Resume Matching | ✅ Complete | Optional (requires PyTorch) |
| Test Evaluation | ✅ Complete | Batch processing, OCR |
| Coding Interviews | ✅ Complete | Monaco editor, anti-cheating |
| Video Interviews | ✅ Complete | Daily.co integration |
| Voice Screening | ✅ Complete | Vapi.ai integration |
| Analytics Dashboard | ✅ Complete | Real-time metrics |
| AI Transcription | ⏳ Planned | Future enhancement |

---

## Contributing Guidelines

When working on this project:

1. **Backend Changes:**
   - Add new API endpoints in `backend/app/api/v1/`
   - Add business logic in `backend/app/services/`
   - Add Pydantic schemas in `backend/app/schemas/`
   - Create migrations in `backend/app/db/migrations/`
   - Update `backend/app/api/v1/__init__.py` to register routes

2. **Frontend Changes:**
   - Add pages in `frontend/src/app/`
   - Add components in `frontend/src/components/`
   - Add API clients in `frontend/src/lib/api/`
   - Follow TypeScript best practices

3. **Documentation:**
   - Update relevant docs in `docs/`
   - Update this file (claude.md) for major changes
   - Add troubleshooting docs for common issues

4. **Testing:**
   - Write pytest tests for new API endpoints
   - Test with actual LLM models (not mocked)
   - Test batch processing with 10+ items

---

## Key Insights for AI Assistants (Claude)

### Code Organization
- **Services contain business logic** - Don't put complex logic in API routes
- **Schemas define contracts** - Use Pydantic for validation
- **Migrations are versioned** - Always create new migration files, don't edit existing ones
- **Config is centralized** - All settings in config.py (Pydantic Settings)

### Common Tasks
- **Add new endpoint:** Create in `api/v1/`, add service, schema, update __init__.py
- **Add new LLM task:** Update `model_config.py` with task-model mapping
- **Add new migration:** Create numbered .sql file in `db/migrations/`
- **Add new UI component:** Create in `components/ui/` or use shadcn/ui

### Important Files
- `backend/app/main.py` - FastAPI app entry point
- `backend/app/config.py` - All configuration settings
- `backend/app/model_config.py` - LLM model selection
- `frontend/src/app/layout.tsx` - Root layout with providers
- `frontend/next.config.ts` - API proxy configuration

### Design Decisions
- **Why Ollama?** - Local inference, no API costs, full control
- **Why Daily.co?** - Free tier (10K minutes), no credit card, easy integration
- **Why Supabase?** - PostgreSQL + Auth + Storage in one platform
- **Why Next.js 15?** - App Router, React Server Components, built-in API proxy
- **Why shadcn/ui?** - Copy-paste components, full control, Tailwind-based

---

**Last Updated:** 2026-03-02
**Version:** 1.0.0
**License:** MIT (or your license)
