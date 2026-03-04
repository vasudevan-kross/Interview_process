"""
Core configuration re-export.

Provides get_settings() function used across the application.
"""
from functools import lru_cache
from app.config import Settings


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings instance."""
    return Settings()
