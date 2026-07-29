"""Application configuration, loaded from environment variables.

Everything that differs between local / test / production lives here so the
rest of the code never reads ``os.environ`` directly.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    app_name: str = "AcePair"
    environment: str = "development"
    debug: bool = False

    # --- Database ---
    # Async SQLAlchemy URL. asyncpg driver is assumed.
    database_url: str = "postgresql+asyncpg://acepair:acepair@localhost:5432/acepair"

    # --- Auth ---
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24 * 7  # one week

    # --- CORS ---
    # Comma-separated list of allowed origins for the browser frontend.
    cors_origins: str = "*"

    # --- Background matchmaking sweeper ---
    matchmaking_sweep_seconds: int = 20
    # Requests older than this with no group are expired (0 disables expiry).
    match_request_ttl_minutes: int = 60 * 24

    # --- Seeding ---
    # When true, a demo club + courts + members are created on first boot so the
    # deployed instance is never an empty shell.
    seed_demo_data: bool = True

    @property
    def cors_origin_list(self) -> List[str]:
        raw = self.cors_origins.strip()
        if raw in ("", "*"):
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
