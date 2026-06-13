"""Configuration loading from environment."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class Settings:
    """Application settings, immutable after load."""

    app_name: str = "smartdesk-insight"
    env: str = os.getenv("ENV", "development")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    # HTTP server
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # Database
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/smartdesk_insight",
    )

    # NATS JetStream
    nats_url: str = os.getenv("NATS_URL", "nats://localhost:4222")
    nats_stream: str = os.getenv("NATS_STREAM", "SMARTDESK_EVENTS")
    nats_consumer: str = os.getenv("NATS_CONSUMER", "insight-consumer")
    nats_subject: str = os.getenv("NATS_SUBJECT", "smartdesk.ticket.*")
    nats_durable: str = os.getenv("NATS_DURABLE", "insight-durable")

    # Service trust (token validation placeholder)
    service_jwt_audience: str = os.getenv("SERVICE_JWT_AUDIENCE", "insight")
    service_jwt_issuer: str = os.getenv("SERVICE_JWT_ISSUER", "gateway")

    # Notification defaults
    default_page_size: int = int(os.getenv("DEFAULT_PAGE_SIZE", "20"))
    max_page_size: int = int(os.getenv("MAX_PAGE_SIZE", "100"))

    @property
    def is_test(self) -> bool:
        return self.env == "test"


def load_settings() -> Settings:
    return Settings()


settings = load_settings()
