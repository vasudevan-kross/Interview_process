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
