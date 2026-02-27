# Interview Management System - Setup Guide

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (via Supabase)
- Ollama (for LLM features)

---

## 📦 Backend Setup

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment
Create `backend/.env` from `backend/.env.example`:
```env
# Application
APP_NAME=Interview Management API
DEBUG=True

# Database & Vector Store
DB_TYPE=supabase
VECTOR_DB=pgvector
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Storage
STORAGE_TYPE=supabase

# LLM Configuration
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_OLLAMA_MODEL=mistral:7b

# Security
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# File Upload
MAX_UPLOAD_SIZE=10485760
ALLOWED_EXTENSIONS=pdf,docx,doc,txt,png,jpg,jpeg
ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Setup Supabase

#### Run Migrations
Execute in Supabase SQL Editor:
```sql
-- Already done: 001_initial_schema.sql
-- Run this: 002_vector_functions.sql
```

#### Create Storage Buckets
```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('resumes', 'resumes', false),
  ('job-descriptions', 'job-descriptions', false),
  ('test-papers', 'test-papers', false),
  ('answer-sheets', 'answer-sheets', false)
ON CONFLICT (id) DO NOTHING;
```

### 4. Install Ollama Models
```bash
ollama pull mistral:7b
ollama pull llama2:7b
ollama pull codellama:7b
```

### 5. Start Backend
```bash
cd backend
python -m uvicorn app.main:app --reload
```

**API Documentation:** http://localhost:8000/docs

---

## 🎨 Frontend Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Environment
Create `frontend/.env.local` from `frontend/.env.local.example`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Start Frontend
```bash
cd frontend
npm run dev
```

**Application:** http://localhost:3000

---

## 🔐 First User Setup

### Option 1: Sign Up via UI
1. Go to http://localhost:3000/signup
2. Create an account
3. Check email for verification

### Option 2: Create Admin User in Supabase
```sql
-- Insert user in Supabase Auth Dashboard
-- Then assign admin role:
INSERT INTO user_roles (user_id, role_id)
SELECT
  'your-user-id',
  id
FROM roles
WHERE name = 'admin';
```

---

## 📋 Testing the System

### Test Resume Matching
1. Login to dashboard
2. Go to "Resume Matching"
3. Upload a job description (PDF/DOCX)
4. Upload multiple resumes
5. View ranked candidates with match scores

### Test Evaluation
1. Go to "Test Evaluation"
2. Upload question paper
3. Upload candidate answer sheets
4. View automated evaluations with partial credit

---

## 🛠️ Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Kill existing process
# Windows:
netstat -ano | findstr :8000
taskkill /PID <pid> /F

# Linux/Mac:
lsof -ti:8000 | xargs kill -9
```

**Ollama not responding:**
```bash
# Check Ollama status
ollama list

# Restart Ollama
# Windows: Restart Ollama app
# Linux/Mac:
systemctl restart ollama
```

**Database connection error:**
- Verify Supabase URL and keys
- Check if IP is whitelisted in Supabase
- Ensure migrations are run

### Frontend Issues

**Module not found:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Next.js build error:**
```bash
npm run build
# Check for TypeScript errors
```

**Authentication not working:**
- Verify `.env.local` has correct Supabase credentials
- Check browser console for errors
- Clear cookies and try again

---

## 🔄 Development Workflow

### Backend Development
```bash
# Start with auto-reload
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests (when implemented)
pytest

# Check code quality
black .
flake8
```

### Frontend Development
```bash
# Development mode
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
npm start
```

---

## 📊 API Endpoints

### Resume Matching
- `POST /api/v1/resume-matching/job-description` - Upload job description
- `POST /api/v1/resume-matching/resume` - Upload single resume
- `POST /api/v1/resume-matching/resumes/batch` - Batch upload
- `GET /api/v1/resume-matching/job/{id}/candidates` - Get ranked candidates
- `GET /api/v1/resume-matching/job/{id}/statistics` - Get statistics

### Test Evaluation
- `POST /api/v1/test-evaluation/question-paper` - Upload question paper
- `POST /api/v1/test-evaluation/answer-sheet` - Upload answer sheet
- `GET /api/v1/test-evaluation/test/{id}/results` - Get test results
- `GET /api/v1/test-evaluation/test/{id}/statistics` - Get statistics

**Full API Documentation:** http://localhost:8000/docs

---

## 🚀 Production Deployment

### Backend (FastAPI)
- Deploy to: Railway, Render, AWS, Google Cloud
- Use: Gunicorn + Uvicorn workers
- Set environment variables
- Configure CORS for production domain

### Frontend (Next.js)
- Deploy to: Vercel, Netlify, AWS Amplify
- Set environment variables
- Configure custom domain
- Enable SSR/SSG as needed

### Database (Supabase)
- Already production-ready
- Configure RLS policies
- Set up backups
- Monitor usage

---

## 📞 Support

For issues or questions:
1. Check API documentation: http://localhost:8000/docs
2. Review logs in terminal
3. Check Supabase logs
4. Review GitHub issues

---

## 🎯 Next Steps

After setup:
1. Create your first user account
2. Test resume matching workflow
3. Test evaluation workflow
4. Configure role-based permissions
5. Customize for your needs

Enjoy your AI-powered Interview Management System! 🚀
