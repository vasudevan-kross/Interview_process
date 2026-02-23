# Interview Management Application

AI-powered interview management system with resume matching and written test evaluation.

## Features

### Round 1 - Resume Matching
- Upload job descriptions (PDF/DOCX/TXT)
- Upload multiple resumes for batch processing
- AI-powered matching with scores and skill extraction
- Switch between multiple LLM models (Llama 2, Mistral, CodeLlama)
- Semantic search using pgvector

### Round 2 - Written Test Evaluation
- Upload question papers (PDF/DOCX/images with OCR)
- Upload multiple answer sheets
- AI grading with partial credit support
- Domain-specific evaluation (dev/testing/devops)

## Tech Stack

- **Backend**: Python FastAPI
- **Frontend**: Next.js (TypeScript)
- **Database**: Supabase (PostgreSQL + pgvector + Auth + Storage)
- **LLM**: Ollama (local - Mistral, Llama 2, CodeLlama)
- **Vector Search**: pgvector (built into Supabase)
- **Caching**: Redis (optional)

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Desktop
- Git
- Supabase account (free tier)

## Quick Setup

### 1. Clone and Install

```bash
# Clone repository
git clone <your-repo-url>
cd Interview

# Start Docker services (Ollama + Redis)
docker-compose up -d

# Pull LLM models
docker exec -it interview-ollama ollama pull mistral:7b
docker exec -it interview-ollama ollama pull llama2:7b
docker exec -it interview-ollama ollama pull codellama:7b
```

### 2. Supabase Setup

1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to SQL Editor and run `backend/app/db/migrations/001_initial_schema.sql`
4. Copy your project URL and keys from Settings > API

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your Supabase credentials

# Run backend
uvicorn app.main:app --reload
```

Backend will be available at: http://localhost:8000
API Docs at: http://localhost:8000/docs

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local and add your Supabase credentials

# Run frontend
npm run dev
```

Frontend will be available at: http://localhost:3000

## Environment Variables

### Backend (.env)

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_OLLAMA_MODEL=mistral:7b

# Security
SECRET_KEY=your-secret-key-min-32-chars
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Project Structure

```
Interview/
├── backend/
│   ├── app/
│   │   ├── api/v1/           # API routes
│   │   ├── core/             # Business logic
│   │   ├── services/         # Infrastructure services
│   │   ├── models/           # Database models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── db/               # Database config
│   │   └── prompts/          # LLM prompts
│   └── tests/                # Backend tests
│
├── frontend/
│   └── src/
│       ├── app/              # Next.js app router
│       ├── components/       # React components
│       ├── lib/              # Utilities
│       ├── hooks/            # Custom hooks
│       └── store/            # State management
│
└── docker-compose.yml        # Docker services
```

## Development Workflow

1. Start Docker services: `docker-compose up -d`
2. Start backend: `cd backend && uvicorn app.main:app --reload`
3. Start frontend: `cd frontend && npm run dev`
4. Access application at http://localhost:3000

## Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## Cost

- **Development**: $0/month (Supabase free tier + local Ollama)
- **Supabase Free Tier**: 500MB DB, 1GB storage, 50K MAU
- **Everything runs for FREE during development!**

## Scaling

When you outgrow free tier:
- Supabase Pro: $25/month (8GB DB, 100GB storage)
- Can migrate to self-hosted if needed

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
