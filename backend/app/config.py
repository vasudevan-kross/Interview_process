"""Application configuration using Pydantic Settings."""
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "Interview Management API"
    DEBUG: bool = True

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
    DEFAULT_OLLAMA_MODEL: str = "mistral:7b"

    # Ollama OCR Models (for fallback layers)
    OLLAMA_OCR_MODEL: str = "MedAIBase/PaddleOCR-VL:0.9b"
    OLLAMA_FALLBACK_MODEL: str = "glm-ocr:latest"

    # PaddleOCR - Free Handwriting OCR
    PADDLEOCR_ENABLED: bool = True
    PADDLEOCR_LANG: str = "en"
    PADDLEOCR_USE_GPU: bool = False

    # OCR Strategy
    OCR_STRATEGY: str = "auto"  # auto, paddleocr, ollama

    # Redis (optional)
    REDIS_URL: Optional[str] = "redis://localhost:6379"

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # File Upload
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: str = "pdf,docx,doc,txt,png,jpg,jpeg"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # Daily.co Video Service
    DAILY_API_KEY: Optional[str] = None
    DAILY_DOMAIN: Optional[str] = None  # Your custom domain (optional)

    # Video Settings
    ENABLE_VIDEO_INTERVIEWS: bool = False
    MAX_VIDEO_SIZE_MB: int = 5000  # 5GB
    VIDEO_STORAGE_BUCKET: str = "interview-recordings"
    ENABLE_AI_VIDEO_ANALYSIS: bool = True
    ALLOWED_VIDEO_FORMATS: str = "mp4,webm,mov"

    # Frontend URL (for generating join links)
    FRONTEND_URL: str = "http://localhost:3000"

    # Coding Interview Settings
    CODING_INTERVIEW_DEFAULT_GRACE_PERIOD: int = 15  # minutes
    CODING_INTERVIEW_AUTO_SAVE_INTERVAL: int = 30    # seconds
    CODING_INTERVIEW_MAX_DURATION: int = 240         # minutes (4 hours max)
    QUESTION_GENERATION_MODEL: str = "codellama:7b"
    QUESTION_GENERATION_TEMPERATURE: float = 0.7

    # Vapi Voice Screening
    VAPI_PRIVATE_KEY: Optional[str] = None
    VAPI_ASSISTANT_ID: Optional[str] = None

    @property
    def allowed_extensions_list(self) -> List[str]:
        """Get allowed extensions as a list."""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(',')]

    @property
    def allowed_origins_list(self) -> List[str]:
        """Get allowed origins as a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(',')]

    @property
    def allowed_video_formats_list(self) -> List[str]:
        """Get allowed video formats as a list."""
        return [fmt.strip() for fmt in self.ALLOWED_VIDEO_FORMATS.split(',')]


    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
