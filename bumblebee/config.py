"""Application settings loaded from environment / .env via pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://bumblebee:bumblebee@localhost:5433/bumblebee"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_secret_key: str = "change-me"
    environment: str = "development"

    # LLM providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    claude_cli_path: str = "claude"

    # Workspaces
    workspace_root: str = "~/.bumblebee/workspaces"

    # Industry defaults (plan §12)
    session_wall_min: int = 60
    session_tokens_max: int = 160_000
    session_dollars_max: float = 3.0
    issue_dollars_max: float = 10.0
    project_daily_dollars_max: float = 200.0
    compaction_threshold: float = 0.80
    retry_max: int = 3
    heartbeat_seconds: int = 30
    lease_ttl_seconds: int = 600

    # Observability
    otel_exporter_otlp_endpoint: str = ""
    eval_golden_dataset_path: str = "./eval/golden.jsonl"


@lru_cache
def get_settings() -> Settings:
    return Settings()
