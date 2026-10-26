from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Every secret is server-side. The extension never sees these values."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    gemini_api_key: str | None = None
    gemma_model: str = "gemma-4-31b-it"
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"
    gemma_timeout_seconds: float = 45.0
    allow_local_intake: bool = True

    max_image_bytes: int = 8_000_000
    max_text_chars: int = 200_000

    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    allowed_origin_regex: str = r"chrome-extension://.*"

    @property
    def origin_list(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
