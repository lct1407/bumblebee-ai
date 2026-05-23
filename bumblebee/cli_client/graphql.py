"""Minimal GraphQL HTTP client used by `bb` CLI."""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Any

import httpx


class GraphQLError(RuntimeError):
    pass


class GraphQLClient:
    def __init__(self, endpoint: str, token: str | None = None):
        self.endpoint = endpoint
        self.token = token

    @classmethod
    def from_env_or_config(
        cls,
        server_url: str | None = None,
        config_path: str | Path = "~/.bumblebee/cli.json",
    ) -> "GraphQLClient":
        """Resolve endpoint + token from arg / env / config file (in that order)."""
        url = server_url or os.environ.get("BUMBLEBEE_SERVER_URL")
        token = os.environ.get("BUMBLEBEE_TOKEN")

        if not url or not token:
            cfg_path = Path(config_path).expanduser()
            if cfg_path.exists():
                try:
                    cfg = json.loads(cfg_path.read_text())
                    url = url or cfg.get("server_url")
                    token = token or cfg.get("access_token")
                except Exception:
                    pass

        url = url or "http://localhost:8000"
        endpoint = url.rstrip("/") + "/graphql"
        return cls(endpoint=endpoint, token=token)

    def query(self, query: str, variables: dict | None = None) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        body = {"query": query, "variables": variables or {}}
        r = httpx.post(self.endpoint, json=body, headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("errors"):
            raise GraphQLError(json.dumps(data["errors"], indent=2))
        return data.get("data", {})
