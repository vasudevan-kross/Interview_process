# AI-Driven Interview Management Platform

A comprehensive interview management system with AI-powered resume matching, automated test evaluation, and live video interviews.

## 🚀 Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Visit: **http://localhost:3000**

---

## 📋 Features

### 1. Resume Matching 📄
AI-powered resume analysis and job matching with hybrid scoring

### 2. Test Evaluation ✍️
Automated answer sheet processing with OCR and scoring

### 3. Video Interviews 🎥
Live panel interviews with Daily.co (no credit card required!)

### 4. Analytics Dashboard 📊
Comprehensive metrics and insights

---

## 📚 Documentation

All documentation has been organized in the `docs/` folder:

### Setup Guides
- **[Complete Setup](docs/setup/COMPLETE_SETUP.md)** - Full installation guide
- **[Backend Setup](docs/setup/backend-setup.md)** - Backend configuration
- **[Frontend Setup](docs/setup/frontend-setup.md)** - Frontend configuration
- **[Database Setup](docs/setup/database-setup.md)** - Supabase setup
- **[Role Setup](docs/setup/role-setup.md)** - User permissions

### Feature Documentation
- **[Resume Matching](docs/features/resume-matching.md)** - Resume analysis workflow
- **[Test Evaluation](docs/features/test-evaluation.md)** - Answer sheet processing
- **[Video Interviews](docs/features/video-interviews.md)** - Live interviews with Daily.co

### Migration & How-To Guides
- **[Daily.co Migration](docs/guides/daily-co-migration.md)** - Video platform migration guide

---

## 🛠️ Tech Stack

**Backend:** FastAPI, PostgreSQL (Supabase), Ollama, PaddleOCR
**Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
**Video:** Daily.co
**Storage:** Supabase Storage
**AI:** pgvector, Ollama (Mistral/LLaMA)

---

## 📦 Environment Setup

### Backend (.env)
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
DAILY_API_KEY=your-daily-api-key
OLLAMA_BASE_URL=http://localhost:11434
SECRET_KEY=your-secret-key
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 🎯 Project Status

- ✅ Resume Matching - COMPLETE
- ✅ Test Evaluation - COMPLETE
- ✅ Video Interviews - COMPLETE (Daily.co)
- ✅ Analytics Dashboard - COMPLETE
- ⏳ AI Transcription - COMING SOON

---

## 📖 Learn More

See the **[docs/](docs/)** folder for comprehensive documentation on setup, features, and development.

---

**Built with ❤️ using Daily.co for video interviews**
