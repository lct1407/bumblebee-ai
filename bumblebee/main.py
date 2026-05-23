"""FastAPI application entry point. Phase 1 â€” Bumblebee v3."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from bumblebee import __version__
from bumblebee.config import get_settings
from bumblebee.routers import (
    health, projects, issues, events, workflow_runs, chat, plugins,
    notifications, replay as replay_router, auth as auth_router,
    websocket as ws_router, workspaces as workspaces_router,
    stripe_webhooks as stripe_webhooks_router,
    audit as audit_router, changelog as changelog_router,
    billing as billing_router,
    oauth_google as oauth_google_router,
)
from bumblebee.services.obs.trace_emitter import init_tracing
from bumblebee.services.rbac.auto_scope import register_auto_scope_listeners


settings = get_settings()
# Register workspace_id auto-fill listeners at import time.
register_auto_scope_listeners()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks."""
    # Phase 2+: register OTel exporter, start background reapers
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Bumblebee v3 API",
        description="Multi-agent concurrent task management platform",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # tighten in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(projects.router)
    app.include_router(issues.router)
    app.include_router(events.router)
    app.include_router(workflow_runs.router)
    app.include_router(chat.router)
    app.include_router(plugins.router)
    app.include_router(notifications.router)
    app.include_router(replay_router.router)
    app.include_router(auth_router.router)
    app.include_router(oauth_google_router.router)
    app.include_router(workspaces_router.router)
    app.include_router(stripe_webhooks_router.router)
    app.include_router(billing_router.router)
    app.include_router(audit_router.router)
    app.include_router(changelog_router.router)
    app.include_router(ws_router.router)
    init_tracing()
    return app


app = create_app()


def main() -> None:
    """Console script entry. `bumblebee-api`"""
    import uvicorn
    uvicorn.run(
        "bumblebee.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
    )


if __name__ == "__main__":
    main()
