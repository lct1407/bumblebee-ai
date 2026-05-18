"""FastAPI application entry point. Phase 1 — Bumblebee v3."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src import __version__
from src.config import get_settings
from src.routers import health, projects, issues, events, workflow_runs, chat


settings = get_settings()


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
    return app


app = create_app()


def main() -> None:
    """Console script entry. `bumblebee-api`"""
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.environment == "development",
    )


if __name__ == "__main__":
    main()
