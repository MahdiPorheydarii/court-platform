"""Application configuration, loaded from environment variables.

Everything that differs between local / test / production lives here so the
rest of the code never reads ``os.environ`` directly.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    app_name: str = "AcePair"
    environment: str = "development"
    debug: bool = False

    # --- Database ---
    # Async SQLAlchemy URL (asyncpg). Always provided via DATABASE_URL in any
    # real run; this password-less localhost value is only a bare dev fallback.
    database_url: str = "postgresql+asyncpg://acepair@localhost:5432/acepair"

    # --- Auth ---
    # Never hardcode a real secret. Provide JWT_SECRET via the environment; in a
    # non-dev deploy a missing/weak value is replaced by a random per-process
    # secret at startup (see app.main._guard_jwt_secret).
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24 * 7  # one week

    # --- Platform domain ---
    # The domain clubs live under. Club subdomains (riverside.acepair.ir) are
    # served off this root; it also seeds the CORS subdomain rule below.
    root_domain: str = "acepair.ir"

    # --- CORS ---
    # Comma-separated list of allowed origins for the browser frontend.
    cors_origins: str = "*"
    # A regex of extra allowed origins. When left empty it is derived from
    # ``root_domain`` so the apex and any club subdomain (https://<club>.<root>)
    # are permitted without listing each one. Set explicitly to override.
    cors_origin_regex: str = ""

    # --- Background matchmaking sweeper ---
    matchmaking_sweep_seconds: int = 20
    # Requests older than this with no group are expired (0 disables expiry).
    match_request_ttl_minutes: int = 60 * 24

    # --- Seeding ---
    # When true, a demo club + courts + members are created on first boot so the
    # deployed instance is never an empty shell.
    seed_demo_data: bool = True
    # Password for the seeded demo accounts. Set via SEED_DEMO_PASSWORD so no
    # credential is hardcoded; when empty a random one is generated per boot
    # (the demo data still exists, just without a publicly-known login).
    seed_demo_password: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        raw = self.cors_origins.strip()
        if raw in ("", "*"):
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def cors_origin_regex_value(self) -> Optional[str]:
        """Regex matching the apex and any subdomain of ``root_domain`` (https).

        Uses ``fullmatch`` in Starlette, so it never matches look-alike domains
        such as ``https://evil-acepair.ir`` — only ``acepair.ir`` and true
        ``*.acepair.ir`` subdomains.
        """
        if self.cors_origin_regex.strip():
            return self.cors_origin_regex.strip()
        root = self.root_domain.strip()
        if not root:
            return None
        return rf"https?://([a-z0-9-]+\.)*{re.escape(root)}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
