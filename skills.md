# Skills.md - Technical Skills Reference

This document provides a comprehensive reference of all technologies, frameworks, libraries, and skills used in the **AI-Driven Interview Management Platform**.

---

## Backend Skills

### Core Framework & Server

#### FastAPI (0.115+)
- **Purpose:** Modern Python web framework for building APIs
- **Key Features Used:**
  - Async/await support (asynchronous request handling)
  - Automatic OpenAPI/Swagger documentation generation
  - Pydantic integration for request/response validation
  - Dependency injection system
  - APIRouter for modular route organization
  - Background tasks
  - Exception handlers
  - CORS middleware
- **Files:** `backend/app/main.py`, `backend/app/api/v1/*.py`
- **Level Required:** Advanced

#### Uvicorn (0.27.0)
- **Purpose:** Lightning-fast ASGI server for FastAPI
- **Key Features Used:**
  - Hot reload during development (`--reload` flag)
  - Standard configuration (uvloop, httptools)
  - Production-ready performance
- **Usage:** `uvicorn app.main:app --reload`
- **Level Required:** Intermediate

#### Python (3.10+)
- **Purpose:** Core programming language
- **Key Features Used:**
  - Type hints (PEP 484)
  - Async/await (asyncio)
  - Dataclasses
  - Context managers
  - List comprehensions
  - F-strings
  - Pathlib for file operations
- **Level Required:** Advanced

---

### Data Validation & Configuration

#### Pydantic (2.10+)
- **Purpose:** Data validation using Python type annotations
- **Key Features Used:**
  - BaseModel for request/response schemas
  - Field validation with constraints
  - Custom validators
  - Nested models
  - JSON serialization/deserialization
  - Config class for model configuration
- **Files:** `backend/app/schemas/*.py`
- **Level Required:** Advanced

#### Pydantic Settings (2.7+)
- **Purpose:** Application configuration from environment variables
- **Key Features Used:**
  - BaseSettings for environment-based config
  - `.env` file loading
  - Type conversion
  - Default values
  - Property methods for derived values
- **Files:** `backend/app/config.py`
- **Level Required:** Intermediate

---

### Database & Storage

#### Supabase (2.12+)
- **Purpose:** Backend-as-a-Service (PostgreSQL + Auth + Storage)
- **Key Features Used:**
  - PostgreSQL database access
  - Supabase Auth integration
  - Supabase Storage for file uploads
  - Row-level security (RLS)
  - Real-time subscriptions (not actively used)
  - PostgREST API
- **Files:** `backend/app/db/supabase_client.py`, `backend/app/services/storage_service.py`
- **Level Required:** Advanced

#### pgvector (0.2.4)
- **Purpose:** PostgreSQL extension for vector similarity search
- **Key Features Used:**
  - Vector data type
  - Cosine similarity search
  - L2 distance calculations
  - Index optimization for vector queries
  - Hybrid search (vector + keyword)
- **Files:** `backend/app/services/vector_store.py`, `backend/app/db/migrations/002_vector_functions.sql`
- **Level Required:** Advanced

#### SQLAlchemy (2.0.25)
- **Purpose:** SQL toolkit and ORM (used minimally)
- **Key Features Used:**
  - Engine creation
  - Connection pooling
  - Raw SQL execution
- **Level Required:** Intermediate

#### psycopg2-binary (2.9.11+)
- **Purpose:** PostgreSQL adapter for Python
- **Key Features Used:**
  - Database connection
  - Query execution
  - Connection pooling
- **Level Required:** Intermediate

#### Alembic (1.13.1)
- **Purpose:** Database migration tool
- **Key Features Used:**
  - Version control for database schema
  - Migration scripts generation
  - Up/down migrations
- **Files:** `backend/app/db/migrations/*.sql` (custom SQL migrations)
- **Level Required:** Intermediate

---

### LLM & AI

#### Ollama (0.4.7+)
- **Purpose:** Local LLM inference server
- **Key Features Used:**
  - Model management (pull, list)
  - Chat completions API
  - Streaming responses (not actively used)
  - Multiple model support
- **Models Used:**
  - Mistral:7b (fast parsing/extraction)
  - LLaMA:7b (general tasks)
  - LLaMA:13b (evaluation/reasoning)
  - CodeLlama:7b (code tasks)
- **Files:** `backend/app/services/llm_orchestrator.py`
- **Level Required:** Advanced

#### LangChain (0.3.0+)
- **Purpose:** Framework for building LLM applications
- **Key Features Used:**
  - Ollama integration
  - Prompt templates
  - Output parsers
  - Chain composition
- **Files:** `backend/app/services/llm_orchestrator.py`, `backend/app/prompts/`
- **Level Required:** Advanced

#### LangChain Community (0.3.0+)
- **Purpose:** Community-contributed LangChain integrations
- **Key Features Used:**
  - Ollama LLM wrapper
  - Community embeddings
- **Level Required:** Advanced

---

### Document Processing

#### PyPDF2 (3.0.1)
- **Purpose:** PDF file reading and text extraction
- **Key Features Used:**
  - PDF text extraction
  - Page-by-page reading
  - Metadata extraction
- **Files:** `backend/app/services/document_processor.py`
- **Level Required:** Intermediate

#### pdfplumber (0.10.3)
- **Purpose:** Advanced PDF parsing (fallback for PyPDF2)
- **Key Features Used:**
  - Table extraction
  - Better text extraction than PyPDF2
  - Layout analysis
- **Files:** `backend/app/services/document_processor.py`
- **Level Required:** Intermediate

#### python-docx (1.1.0)
- **Purpose:** Microsoft Word (.docx) file processing
- **Key Features Used:**
  - Read .docx files
  - Extract paragraphs and text
  - Document structure parsing
- **Files:** `backend/app/services/document_processor.py`
- **Level Required:** Intermediate

#### Pillow (11.0.0+)
- **Purpose:** Image processing library
- **Key Features Used:**
  - Image loading (JPEG, PNG)
  - Image format conversion
  - Image preprocessing for OCR
- **Files:** `backend/app/services/document_processor.py`
- **Level Required:** Intermediate

#### pdf2image (1.16.3)
- **Purpose:** Convert PDF pages to images
- **Key Features Used:**
  - PDF to PIL Image conversion
  - Page-by-page conversion
  - DPI configuration
- **Files:** `backend/app/services/test_evaluation.py`
- **Level Required:** Intermediate

---

### OCR & Machine Learning (Optional)

#### PaddleOCR (2.7.0+) - OPTIONAL
- **Purpose:** Free OCR engine for handwritten/printed text
- **Key Features Used:**
  - English text recognition
  - CPU/GPU support
  - High accuracy for handwritten text
- **Files:** `backend/app/services/test_evaluation.py`
- **Level Required:** Advanced
- **Status:** Optional - requires separate installation

#### PaddlePaddle (2.5.0+) - OPTIONAL
- **Purpose:** Deep learning framework for PaddleOCR
- **Key Features Used:**
  - OCR model inference
  - CPU/GPU acceleration
- **Level Required:** Advanced
- **Status:** Optional - requires separate installation

#### sentence-transformers (2.3.1) - OPTIONAL
- **Purpose:** Generate text embeddings for semantic search
- **Key Features Used:**
  - Sentence embeddings
  - all-MiniLM-L6-v2 model
  - Cosine similarity calculations
- **Files:** `backend/app/services/vector_store.py`
- **Level Required:** Advanced
- **Status:** Optional - required for Resume Matching

#### transformers (4.30.0+) - OPTIONAL
- **Purpose:** Hugging Face transformers library
- **Key Features Used:**
  - Pre-trained model loading
  - Tokenization
  - Model inference
- **Level Required:** Advanced
- **Status:** Optional - dependency of sentence-transformers

#### PyTorch (torch, torchvision) - OPTIONAL
- **Purpose:** Deep learning framework
- **Key Features Used:**
  - Tensor operations
  - Model inference
  - CUDA support (GPU acceleration)
- **Installation:** Installed by `be.bat` script
- **Level Required:** Advanced
- **Status:** Optional - required for ML-based features

---

### Security & Authentication

#### python-jose (3.3.0)
- **Purpose:** JWT (JSON Web Tokens) implementation
- **Key Features Used:**
  - JWT encoding/decoding
  - Token signing with HS256
  - Token expiration handling
  - Cryptography backend
- **Files:** `backend/app/auth/`
- **Level Required:** Advanced

#### passlib (1.7.4)
- **Purpose:** Password hashing library
- **Key Features Used:**
  - bcrypt hashing
  - Password verification
  - Secure password storage
- **Files:** `backend/app/auth/`
- **Level Required:** Intermediate

#### python-multipart (0.0.6)
- **Purpose:** Multipart form data parsing
- **Key Features Used:**
  - File upload handling in FastAPI
  - Form data parsing
- **Level Required:** Beginner

---

### Utilities & Helpers

#### python-dotenv (1.0.0)
- **Purpose:** Load environment variables from .env files
- **Key Features Used:**
  - `.env` file parsing
  - Environment variable loading
  - Development/production config separation
- **Files:** `backend/app/config.py`
- **Level Required:** Beginner

#### httpx (0.27.0+)
- **Purpose:** Async HTTP client (modern alternative to requests)
- **Key Features Used:**
  - Async HTTP requests
  - Daily.co API calls
  - Vapi.ai API calls
  - Webhook delivery
- **Files:** `backend/app/services/video_interview_service.py`, `backend/app/services/voice_screening_service.py`
- **Level Required:** Intermediate

#### aiofiles (23.2.1)
- **Purpose:** Async file I/O operations
- **Key Features Used:**
  - Async file reading/writing
  - Non-blocking file operations
- **Files:** `backend/app/services/storage_service.py`
- **Level Required:** Intermediate

---

### Background Tasks & Caching (Optional)

#### Redis (5.0.1)
- **Purpose:** In-memory data store (caching, background jobs)
- **Key Features Used:**
  - Key-value storage
  - Caching LLM responses
  - Session storage
- **Status:** Optional - not actively used
- **Level Required:** Intermediate

#### Celery (5.3.4)
- **Purpose:** Distributed task queue
- **Key Features Used:**
  - Background task processing
  - Task scheduling
  - Worker management
- **Status:** Optional - not actively used
- **Level Required:** Advanced

---

### Data Processing & Export

#### pandas (2.0.0+)
- **Purpose:** Data manipulation and analysis
- **Key Features Used:**
  - DataFrame operations
  - CSV/Excel reading
  - Data export to Excel
- **Files:** `backend/app/services/voice_screening_service.py`
- **Level Required:** Intermediate

#### openpyxl (3.1.0+)
- **Purpose:** Excel file (.xlsx) reading/writing
- **Key Features Used:**
  - Excel file generation
  - Worksheet creation
  - Cell formatting
- **Files:** `backend/app/services/voice_screening_service.py`
- **Level Required:** Intermediate

---

### Testing

#### pytest (7.4.4)
- **Purpose:** Testing framework for Python
- **Key Features Used:**
  - Test discovery
  - Fixtures
  - Parametrized tests
  - Async test support
- **Files:** `backend/tests/`
- **Level Required:** Intermediate

#### pytest-asyncio (0.23.3)
- **Purpose:** Async test support for pytest
- **Key Features Used:**
  - Async test functions
  - Event loop fixtures
- **Level Required:** Intermediate

#### pytest-cov (4.1.0)
- **Purpose:** Code coverage reporting for pytest
- **Key Features Used:**
  - Coverage measurement
  - HTML reports
  - Coverage thresholds
- **Level Required:** Intermediate

---

## Frontend Skills

### Core Framework

#### Next.js (15.1.8)
- **Purpose:** React framework for production
- **Key Features Used:**
  - App Router (file-based routing)
  - React Server Components (RSC)
  - Client Components
  - API route rewrites (proxy to backend)
  - Image optimization
  - Automatic code splitting
  - TypeScript support
  - Hot Module Replacement (HMR)
- **Files:** `frontend/src/app/**`, `frontend/next.config.ts`
- **Level Required:** Advanced

#### React (19.0.0)
- **Purpose:** UI library for building components
- **Key Features Used:**
  - Functional components
  - Hooks (useState, useEffect, useCallback, useMemo, useRef)
  - Custom hooks
  - Context API
  - Suspense (for loading states)
  - Error boundaries
- **Files:** `frontend/src/components/**`, `frontend/src/app/**`
- **Level Required:** Advanced

#### TypeScript (5.7.3)
- **Purpose:** Typed superset of JavaScript
- **Key Features Used:**
  - Type annotations
  - Interfaces and types
  - Generics
  - Union types
  - Type guards
  - Utility types (Partial, Pick, Omit, etc.)
- **Files:** All `.ts` and `.tsx` files
- **Level Required:** Advanced

---

### Styling & UI Components

#### Tailwind CSS (3.4.17)
- **Purpose:** Utility-first CSS framework
- **Key Features Used:**
  - Utility classes
  - Custom theme configuration
  - Dark mode support
  - Responsive design
  - Custom colors/spacing
- **Files:** `frontend/tailwind.config.ts`, all component files
- **Level Required:** Intermediate

#### shadcn/ui (Radix UI)
- **Purpose:** Copy-paste UI component library
- **Components Used:**
  - Alert Dialog (@radix-ui/react-alert-dialog)
  - Avatar (@radix-ui/react-avatar)
  - Checkbox (@radix-ui/react-checkbox)
  - Dialog (@radix-ui/react-dialog)
  - Dropdown Menu (@radix-ui/react-dropdown-menu)
  - Label (@radix-ui/react-label)
  - Progress (@radix-ui/react-progress)
  - Select (@radix-ui/react-select)
  - Slot (@radix-ui/react-slot)
  - Tabs (@radix-ui/react-tabs)
  - Toast (@radix-ui/react-toast)
- **Files:** `frontend/src/components/ui/**`
- **Level Required:** Intermediate

#### class-variance-authority (0.7.1)
- **Purpose:** CSS class variance management
- **Key Features Used:**
  - Variant-based component styling
  - Composable variants
- **Files:** `frontend/src/components/ui/button.tsx`, etc.
- **Level Required:** Intermediate

#### clsx (2.1.1)
- **Purpose:** Utility for constructing className strings
- **Key Features Used:**
  - Conditional class names
  - Class merging
- **Files:** Most component files
- **Level Required:** Beginner

#### tailwind-merge (3.0.1)
- **Purpose:** Merge Tailwind classes without conflicts
- **Key Features Used:**
  - Class deduplication
  - Override resolution
- **Files:** `frontend/src/lib/utils.ts`
- **Level Required:** Beginner

#### tailwindcss-animate (1.0.7)
- **Purpose:** Animation utilities for Tailwind
- **Key Features Used:**
  - Pre-built animations
  - Fade-in, slide-in, etc.
- **Files:** Component animations
- **Level Required:** Beginner

---

### Forms & Validation

#### react-hook-form (7.54.2)
- **Purpose:** Form state management and validation
- **Key Features Used:**
  - useForm hook
  - Form registration
  - Validation rules
  - Error handling
  - Controller for custom inputs
- **Files:** All form components
- **Level Required:** Intermediate

#### zod (3.24.1)
- **Purpose:** TypeScript-first schema validation
- **Key Features Used:**
  - Schema definition
  - Type inference
  - Validation rules
  - Error messages
  - Integration with react-hook-form
- **Files:** Form validation schemas
- **Level Required:** Intermediate

#### @hookform/resolvers (3.9.1)
- **Purpose:** Validation resolvers for react-hook-form
- **Key Features Used:**
  - Zod resolver integration
- **Level Required:** Beginner

---

### State Management

#### Zustand (5.0.3)
- **Purpose:** Lightweight state management
- **Key Features Used:**
  - Global stores
  - Immer integration (immutable updates)
  - Persistence
  - TypeScript support
- **Files:** `frontend/src/lib/store.ts` (if exists)
- **Level Required:** Intermediate

#### Jotai (2.18.0)
- **Purpose:** Atomic state management
- **Key Features Used:**
  - Atoms (primitive state)
  - Derived atoms
  - Async atoms
- **Files:** State management files
- **Level Required:** Intermediate

---

### Data Fetching & HTTP

#### TanStack React Query (5.62.0)
- **Purpose:** Data fetching, caching, and synchronization
- **Key Features Used:**
  - useQuery hook (data fetching)
  - useMutation hook (data mutations)
  - Query invalidation
  - Automatic refetching
  - Loading/error states
  - Query caching
- **Files:** `frontend/src/lib/api/**`
- **Level Required:** Advanced

#### Axios (1.7.9)
- **Purpose:** HTTP client for API requests
- **Key Features Used:**
  - GET/POST/PUT/DELETE requests
  - Interceptors (auth headers)
  - Error handling
  - File uploads (multipart/form-data)
- **Files:** `frontend/src/lib/api/**`
- **Level Required:** Intermediate

---

### Video Conferencing

#### @daily-co/daily-js (0.71.0)
- **Purpose:** Daily.co JavaScript SDK
- **Key Features Used:**
  - Room creation
  - Participant management
  - Device controls
  - Event listeners
- **Files:** `frontend/src/components/video/**`
- **Level Required:** Advanced

#### @daily-co/daily-react (0.24.0)
- **Purpose:** React hooks for Daily.co
- **Key Features Used:**
  - useDaily hook
  - useParticipants hook
  - useDevices hook
  - useScreenShare hook
- **Files:** `frontend/src/components/video/**`
- **Level Required:** Advanced

---

### Voice AI

#### @vapi-ai/web (2.5.2)
- **Purpose:** Vapi.ai JavaScript SDK for voice interviews
- **Key Features Used:**
  - Voice call initiation
  - Call event handling
  - Call status tracking
  - Audio controls
- **Files:** `frontend/src/components/voice/**`
- **Level Required:** Advanced

---

### Code Editor

#### @monaco-editor/react (4.7.0)
- **Purpose:** React wrapper for Monaco Editor (VS Code's editor)
- **Key Features Used:**
  - Code editor component
  - Syntax highlighting
  - Multi-language support (Python, Java, JavaScript, etc.)
  - IntelliSense (basic)
  - Theme customization
  - Auto-save integration
- **Files:** `frontend/src/components/coding/**`
- **Level Required:** Advanced

---

### Database & Authentication (Client-side)

#### @supabase/supabase-js (2.48.0)
- **Purpose:** Supabase JavaScript client
- **Key Features Used:**
  - Database queries
  - Authentication
  - Storage (file upload/download)
  - Real-time subscriptions (not actively used)
- **Files:** `frontend/src/lib/supabase/**`
- **Level Required:** Advanced

#### @supabase/ssr (0.5.2)
- **Purpose:** Server-side rendering support for Supabase
- **Key Features Used:**
  - Server Component support
  - Cookie-based auth
  - Session management
- **Files:** `frontend/src/lib/supabase/**`
- **Level Required:** Advanced

---

### UI Utilities

#### Lucide React (0.475.0)
- **Purpose:** Icon library (modern alternative to Feather Icons)
- **Key Features Used:**
  - 1000+ icons
  - Tree-shakeable
  - TypeScript support
- **Files:** All component files (icons)
- **Level Required:** Beginner

#### Framer Motion (11.15.0)
- **Purpose:** Animation library for React
- **Key Features Used:**
  - Component animations
  - Layout animations
  - Variants
  - Gestures (drag, hover, tap)
- **Files:** Animated components
- **Level Required:** Intermediate

#### Recharts (2.15.1)
- **Purpose:** Charting library built on React
- **Key Features Used:**
  - Bar charts
  - Line charts
  - Pie charts
  - Responsive charts
- **Files:** `frontend/src/app/dashboard/analytics/**`
- **Level Required:** Intermediate

#### Sonner (1.7.3)
- **Purpose:** Toast notification library
- **Key Features Used:**
  - Toast notifications
  - Success/error/info toasts
  - Custom styling
- **Files:** Layout/toast components
- **Level Required:** Beginner

---

### File Handling & Data Processing

#### react-dropzone (14.3.5)
- **Purpose:** Drag-and-drop file upload component
- **Key Features Used:**
  - File drop zone
  - File validation (type, size)
  - Multiple file upload
  - Custom styling
- **Files:** `frontend/src/components/ui/file-upload.tsx`
- **Level Required:** Intermediate

#### papaparse (5.5.3)
- **Purpose:** CSV parsing library
- **Key Features Used:**
  - CSV to JSON conversion
  - Streaming large files
  - Header detection
- **Files:** Voice screening bulk upload
- **Level Required:** Intermediate

#### @types/papaparse (5.5.2)
- **Purpose:** TypeScript definitions for papaparse
- **Level Required:** Beginner

#### xlsx (0.18.5)
- **Purpose:** Excel file reading/writing
- **Key Features Used:**
  - Excel to JSON conversion
  - Bulk data import
- **Files:** Voice screening bulk upload
- **Level Required:** Intermediate

---

### Date & Time

#### date-fns (4.1.0)
- **Purpose:** Date utility library (modern alternative to moment.js)
- **Key Features Used:**
  - Date formatting
  - Date calculations
  - Relative time
- **Files:** Date display components
- **Level Required:** Intermediate

---

## DevOps & Infrastructure Skills

### Docker

#### Docker & Docker Compose
- **Purpose:** Containerization platform
- **Key Features Used:**
  - Ollama container (LLM server)
  - Redis container (caching)
  - Multi-container orchestration
- **Files:** `docker-compose.yml`
- **Level Required:** Intermediate

---

### Version Control

#### Git
- **Purpose:** Version control system
- **Key Features Used:**
  - Branching
  - Commits
  - Pull requests
  - Merge conflicts
- **Files:** `.gitignore`
- **Level Required:** Intermediate

---

### Tunneling & Networking

#### ngrok
- **Purpose:** Secure tunneling to localhost
- **Key Features Used:**
  - HTTP/HTTPS tunneling
  - Webhook delivery
  - Public URL generation
- **Files:** `start-ngrok.bat`
- **Level Required:** Beginner

---

## Domain-Specific Skills

### AI/Machine Learning Concepts

1. **LLM (Large Language Models)**
   - Model selection strategies
   - Prompt engineering
   - Temperature/sampling parameters
   - Token limits
   - Context windows

2. **Vector Similarity Search**
   - Embeddings generation
   - Cosine similarity
   - L2 distance
   - Hybrid search (vector + keyword)
   - Index optimization

3. **OCR (Optical Character Recognition)**
   - Handwriting recognition
   - Printed text recognition
   - Image preprocessing
   - Multi-language support

4. **Natural Language Processing**
   - Text extraction
   - Keyword extraction
   - Semantic similarity
   - Entity recognition

---

### Software Architecture Patterns

1. **Service-Oriented Architecture (SOA)**
   - Separation of concerns (API ↔ Service ↔ DB)
   - Service layer pattern
   - Repository pattern

2. **Dependency Injection**
   - Factory functions
   - Service singletons

3. **RESTful API Design**
   - Resource naming
   - HTTP methods
   - Status codes
   - Request/response schemas

4. **Component-Driven Development**
   - Reusable components
   - Composition over inheritance
   - Props drilling vs. state management

---

### Database Concepts

1. **SQL/PostgreSQL**
   - Schema design
   - Foreign keys & relationships
   - Indexes
   - Migrations
   - Row-level security

2. **Vector Databases**
   - Vector data types
   - Similarity search algorithms
   - Indexing strategies (IVFFlat, HNSW)

3. **NoSQL Concepts** (for Supabase Storage)
   - Object storage
   - Bucket policies
   - CDN integration

---

### Security Concepts

1. **Authentication & Authorization**
   - JWT tokens
   - Session management
   - Role-based access control (RBAC)
   - Row-level security (RLS)

2. **Password Security**
   - Password hashing (bcrypt)
   - Salt generation
   - Secure storage

3. **API Security**
   - CORS policies
   - API keys
   - Rate limiting
   - Input validation

---

### Real-Time Communication

1. **WebRTC**
   - Peer-to-peer connections
   - Media streams (video/audio)
   - Screen sharing
   - Network traversal (STUN/TURN)

2. **Webhooks**
   - Event-driven architecture
   - Callback URLs
   - Signature verification
   - Retry mechanisms

---

## Skill Level Breakdown

### Must-Have Skills (Critical)
- Python (Advanced)
- FastAPI (Advanced)
- TypeScript (Advanced)
- React (Advanced)
- Next.js (Advanced)
- PostgreSQL/Supabase (Advanced)
- REST API Design (Advanced)
- Git (Intermediate)

### Important Skills (Highly Recommended)
- Pydantic (Advanced)
- TanStack React Query (Advanced)
- Tailwind CSS (Intermediate)
- Async programming (Python & JavaScript)
- JWT authentication
- Vector databases (pgvector)
- LLM/AI concepts

### Nice-to-Have Skills (Optional)
- Docker (Intermediate)
- Redis (Intermediate)
- Celery (Advanced)
- PyTorch/ML (Advanced)
- OCR technologies
- Video conferencing APIs
- Voice AI integration

### Framework-Specific Skills
- shadcn/ui component library
- Monaco Editor integration
- Daily.co SDK
- Vapi.ai SDK
- Ollama API

---

## Learning Resources

### Backend
- **FastAPI:** https://fastapi.tiangolo.com/
- **Pydantic:** https://docs.pydantic.dev/
- **Supabase:** https://supabase.com/docs
- **LangChain:** https://python.langchain.com/
- **Ollama:** https://ollama.ai/

### Frontend
- **Next.js:** https://nextjs.org/docs
- **React:** https://react.dev/
- **TypeScript:** https://www.typescriptlang.org/docs/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **shadcn/ui:** https://ui.shadcn.com/
- **TanStack Query:** https://tanstack.com/query/latest

### AI/ML
- **pgvector:** https://github.com/pgvector/pgvector
- **PaddleOCR:** https://github.com/PaddlePaddle/PaddleOCR
- **sentence-transformers:** https://www.sbert.net/

### Integrations
- **Daily.co:** https://docs.daily.co/
- **Vapi.ai:** https://docs.vapi.ai/

---

## Skill Dependency Tree

```
Backend Developer Path:
1. Python fundamentals
   ├── 2. Async/await programming
   ├── 3. Type hints & Pydantic
   ├── 4. FastAPI framework
   │   ├── 5. REST API design
   │   ├── 6. Dependency injection
   │   └── 7. OpenAPI/Swagger
   ├── 8. PostgreSQL & Supabase
   │   ├── 9. SQL queries
   │   ├── 10. Vector search (pgvector)
   │   └── 11. Database migrations
   ├── 12. LLM/AI integration
   │   ├── 13. Ollama
   │   ├── 14. LangChain
   │   └── 15. Prompt engineering
   └── 16. Document processing
       ├── 17. PDF/DOCX parsing
       └── 18. OCR (PaddleOCR)

Frontend Developer Path:
1. JavaScript fundamentals
   ├── 2. TypeScript
   ├── 3. React
   │   ├── 4. Hooks
   │   ├── 5. Context API
   │   └── 6. Custom hooks
   ├── 7. Next.js
   │   ├── 8. App Router
   │   ├── 9. Server Components
   │   └── 10. API routes
   ├── 11. Tailwind CSS
   │   └── 12. shadcn/ui components
   ├── 13. Form handling
   │   ├── 14. react-hook-form
   │   └── 15. zod validation
   ├── 16. State management
   │   ├── 17. Zustand
   │   └── 18. Jotai
   └── 19. Data fetching
       └── 20. TanStack React Query

Full-Stack Developer Path:
1. Complete Backend path
2. Complete Frontend path
3. API integration (backend ↔ frontend)
4. Authentication flow (JWT + Supabase)
5. File upload/download flow
6. Real-time features (WebSockets/WebRTC)
7. Deployment & DevOps (Docker, nginx)
```

---

## Technology Alternatives (What You Could Use Instead)

### Backend Alternatives
| Current | Alternative Options |
|---------|---------------------|
| FastAPI | Django REST Framework, Flask, Express.js |
| PostgreSQL | MySQL, MongoDB, Firebase |
| Supabase | Firebase, AWS RDS, PlanetScale |
| Ollama | OpenAI API, Anthropic API, Hugging Face Inference API |
| PaddleOCR | Tesseract, Google Cloud Vision, AWS Textract |

### Frontend Alternatives
| Current | Alternative Options |
|---------|---------------------|
| Next.js | Remix, SvelteKit, Nuxt.js |
| React | Vue, Svelte, Angular |
| Tailwind CSS | Bootstrap, Material-UI, Chakra UI |
| shadcn/ui | Material-UI, Ant Design, Mantine |
| TanStack Query | SWR, Apollo Client, RTK Query |
| Zustand | Redux, MobX, Recoil |

### Integration Alternatives
| Current | Alternative Options |
|---------|---------------------|
| Daily.co | Twilio, Agora, Zoom SDK, Jitsi |
| Vapi.ai | Twilio Voice, Vonage, Amazon Connect |
| Monaco Editor | CodeMirror, Ace Editor |

---

## Performance Optimization Skills

### Backend
- Async programming (avoid blocking I/O)
- Database indexing (vector indexes, B-tree)
- Connection pooling
- Caching (Redis)
- Batch processing (parallel operations)
- Query optimization (N+1 problem)

### Frontend
- Code splitting (Next.js automatic)
- Lazy loading (React.lazy)
- Memoization (useMemo, useCallback)
- Image optimization (Next.js Image)
- Bundle size optimization (tree-shaking)
- Virtual scrolling (for large lists)

---

**Last Updated:** 2026-03-02
**Skill Count:** 100+ distinct technologies and frameworks
**Difficulty Level:** Intermediate to Advanced full-stack development
