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
    gemini_model: str = "gemini-2.0-flash"  # cheap + fast for MCP tools
    claude_cli_path: str = "claude"

    # Vertex AI (alternative auth path; if set, used instead of gemini_api_key)
    vertex_ai_project: str = ""
    vertex_ai_location: str = "global"
    vertex_ai_api_key: str = ""

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

    # Google OAuth (optional — when set, "Sign in with Google" button works)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_oauth_redirect_url: str = "http://localhost:8000/api/auth/google/callback"
    web_base_url: str = "http://localhost:3000"  # for post-OAuth redirect

    # Stripe billing (Phase D activates these; Phase A scaffolds with empty values)
    stripe_secret_key: str = ""           # sk_test_... in dev, sk_live_... in prod
    stripe_publishable_key: str = ""      # pk_test_... / pk_live_... (frontend reads)
    stripe_webhook_secret: str = ""       # whsec_... from `stripe listen` or Dashboard
    stripe_price_pro_id: str = ""         # price_... (created by scripts/stripe_setup_catalog.py)
    stripe_price_team_id: str = ""
    stripe_price_team_usage_id: str = ""  # metered LLM-cost passthrough
    billing_enabled: bool = False         # gate live Stripe calls until Phase D is ready


@lru_cache
def get_settings() -> Settings:
    return Settings()
