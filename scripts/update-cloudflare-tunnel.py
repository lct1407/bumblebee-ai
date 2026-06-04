"""Update Cloudflare Tunnel ingress rules for the Bumblebee deployment.

Idempotent — reads desired ingress from this file's INGRESS constant and pushes
to Cloudflare. Run after changing service routing.

Env required (loaded from .env):
    CLOUDFLARE_API_TOKEN
    CLOUDFLARE_ZONE_ID  (informational)

Tunnel + account IDs are hardcoded for this deployment.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

from dotenv import load_dotenv

ACCOUNT_ID = "2c488a9cc706930a4b0a163a9d989f8d"
TUNNEL_ID = "f200e092-f979-4438-8e9c-6c78b3a795e6"

INGRESS = [
    {"hostname": "bb-api.hubapi.cc", "service": "http://api:8000"},
    {"hostname": "coolify.hubapi.cc", "service": "http://coolify:8080"},
    # path-based MCP rule MUST come before bb.hubapi.cc catch-all
    {"hostname": "bb.hubapi.cc", "path": "/mcp.*", "service": "http://mcp:8080"},
    {"hostname": "bb.hubapi.cc", "service": "http://web:3000"},
    {"hostname": "bumble.hubapi.cc", "service": "http://web:3000"},
    {"service": "http_status:404"},
]


def main() -> int:
    load_dotenv(".env")
    token = os.getenv("CLOUDFLARE_API_TOKEN")
    if not token:
        print("ERROR: CLOUDFLARE_API_TOKEN missing in .env", file=sys.stderr)
        return 1

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"
        f"/cfd_tunnel/{TUNNEL_ID}/configurations"
    )
    body = {"config": {"ingress": INGRESS, "warp-routing": {"enabled": False}}}
    req = urllib.request.Request(
        url,
        method="PUT",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(body).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:600]}", file=sys.stderr)
        return 1

    print(f"version={resp['result']['version']} success={resp['success']}")
    for rule in resp["result"]["config"]["ingress"]:
        host = rule.get("hostname", "*")
        path = rule.get("path", "")
        svc = rule.get("service", "")
        print(f"  {host:30} {path:12} -> {svc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
