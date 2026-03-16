"""Application configuration using Pydantic Settings."""
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "Interview Management API"
    DEBUG: bool = False

    # Database & Vector Store
    DB_TYPE: str = "supabase"  # or 'local'
    VECTOR_DB: str = "pgvector"  # or 'chroma'

    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str  # service_role key
    SUPABASE_ANON_KEY: str

    # Storage
    STORAGE_TYPE: str = "supabase"  # or 'local'
    UPLOAD_DIR: str = "./uploads"  # for local storage

    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    DEFAULT_OLLAMA_MODEL: str = "qwen2.5:7b"
    OLLAMA_NUM_CTX: int = 8192

    # Ollama OCR Models (for fallback layers)
    OLLAMA_OCR_MODEL: str = "llava:7b"
    OLLAMA_FALLBACK_MODEL: str = "llava:7b"

    # PaddleOCR - Free Handwriting OCR
    PADDLEOCR_ENABLED: bool = True
    PADDLEOCR_LANG: str = "en"
    PADDLEOCR_USE_GPU: bool = False

    # OCR Strategy
    OCR_STRATEGY: str = "auto"  # auto, paddleocr, ollama


    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # File Upload
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: str = "pdf,docx,doc,txt,png,jpg,jpeg"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Frontend URL (for generating join links)
    FRONTEND_URL: str = "http://localhost:3000"

    # Backend URL (for webhooks - ngrok/cloudflare tunnel URL)
    BACKEND_URL: Optional[str] = None

    # Coding Interview Settings
    CODING_INTERVIEW_DEFAULT_GRACE_PERIOD: int = 15  # minutes
    CODING_INTERVIEW_AUTO_SAVE_INTERVAL: int = 30    # seconds
    CODING_INTERVIEW_MAX_DURATION: int = 240         # minutes (4 hours max)
    QUESTION_GENERATION_MODEL: str = "qwen2.5:7b"
    QUESTION_GENERATION_TEMPERATURE: float = 0.4

    # Vapi Voice Screening
    VAPI_PRIVATE_KEY: Optional[str] = None
    VAPI_ASSISTANT_ID: Optional[str] = None

    # Gmail SMTP (for transactional emails)
    GMAIL_SENDER: Optional[str] = None          # Set in .env — e.g. yourname@gmail.com
    GMAIL_APP_PASSWORD: Optional[str] = None   # 16-char Google App Password

    # Vision-based evaluation (for handwritten answer sheets)
    VISION_EVAL_ENABLED: bool = True
    VISION_EVAL_OCR_QUALITY_THRESHOLD: float = 0.5

    @property
    def allowed_extensions_list(self) -> List[str]:
        """Get allowed extensions as a list."""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(',')]

    @property
    def allowed_origins_list(self) -> List[str]:
        """Get allowed origins as a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(',')]


    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
