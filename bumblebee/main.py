"""FastAPI application entry point. Phase 1 â€” Bumblebee v3."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from bumblebee import __version__
from bumblebee.config import get_settings
from bumblebee.routers import (
    audit as audit_router,
)
from bumblebee.routers import (
    auth as auth_router,
)
from bumblebee.routers import (
    billing as billing_router,
)
from bumblebee.routers import (
    changelog as changelog_router,
)
from bumblebee.routers import (
    chat,
    comments,
    events,
    health,
    issues,
    milestones,
    notifications,
    plugins,
    projects,
    workflow_runs,
)
from bumblebee.routers import (
    devices as devices_router,
)
from bumblebee.routers import (
    metrics as metrics_router,
)
from bumblebee.routers import (
    oauth_google as oauth_google_router,
)
from bumblebee.routers import (
    replay as replay_router,
)
from bumblebee.routers import (
    stripe_webhooks as stripe_webhooks_router,
)
from bumblebee.routers import (
    tasks as tasks_router,
)
from bumblebee.routers import (
    webhooks_github as webhooks_github_router,
)
from bumblebee.routers import (
    websocket as ws_router,
)
from bumblebee.routers import (
    workspaces as workspaces_router,
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
    app.include_router(milestones.router)
    app.include_router(comments.router)
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
    app.include_router(devices_router.router)
    app.include_router(tasks_router.router)
    app.include_router(webhooks_github_router.router)
    app.include_router(metrics_router.router)
    # BB-9: Sentry SDK init (no-op if SENTRY_DSN empty)
    from bumblebee.services.obs.sentry_init import init_sentry
    init_sentry()

    # GraphQL surface (primary API as of 2026-05-23)
    from bumblebee.graphql import graphql_router
    app.include_router(graphql_router, prefix="")
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
