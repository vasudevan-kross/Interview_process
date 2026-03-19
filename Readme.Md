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

All documentation has been consolidated into comprehensive guides:

- **[Agent Context & Full Documentation](docs/AGENT_CONTEXT.md)** - Contains the complete project architecture, technical skills reference, detailed setup guides, feature integration details (Daily.co, Vapi.ai), and all troubleshooting/debugging steps.
- **[Anti-Cheating & Risk Evaluation](docs/ANTI_CHEATING.md)** - Explains the frontend tracking logic and backend risk scoring algorithm for candidate evaluations.

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

See **[docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md)** for comprehensive documentation on setup, features, troubleshooting, and development.

---

**Built with ❤️ using Daily.co for video interviews**
