"""Create a Coolify API token via Livewire after web login.

Steps:
  1. Login via /login (CSRF + cookies)
  2. GET /security/api-tokens, extract the security.api-tokens component snapshot
  3. POST /livewire/update with method=addNewToken, params={description, permissions, expiresInDays}
  4. Re-GET the page to scrape the newly-shown plain token (Coolify reveals it once after creation)
"""
from __future__ import annotations

import html
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://coolify.hubapi.cc"


def login(email: str, password: str):
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    opener.addheaders = [("User-Agent", "Mozilla/5.0 bumblebee-bootstrap")]
    r = opener.open(f"{BASE}/login", timeout=20)
    csrf = re.search(r'name="_token"\s+value="([^"]+)"', r.read().decode()).group(1)
    data = urllib.parse.urlencode({"_token": csrf, "email": email, "password": password}).encode()
    req = urllib.request.Request(f"{BASE}/login", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    opener.open(req, timeout=20)
    return opener, cj


def find_component(body: str, name: str):
    for m in re.finditer(r'wire:snapshot="([^"]+)"\s+wire:effects="([^"]*)"\s+wire:id="([^"]+)"', body):
        try:
            snap = json.loads(html.unescape(m.group(1)))
            if snap.get("memo", {}).get("name") == name:
                return {
                    "snapshot_raw": html.unescape(m.group(1)),
                    "snapshot": snap,
                    "wire_id": m.group(3),
                }
        except Exception:
            continue
    # Fallback — match without strict ordering
    for m in re.finditer(r'wire:snapshot="([^"]+)"', body):
        try:
            snap = json.loads(html.unescape(m.group(1)))
            if snap.get("memo", {}).get("name") == name:
                return {"snapshot_raw": html.unescape(m.group(1)), "snapshot": snap, "wire_id": None}
        except Exception:
            continue
    return None


def get_csrf_from_meta(body: str) -> str:
    m = re.search(r'name="csrf-token"\s+content="([^"]+)"', body)
    return m.group(1) if m else None


def create_token(opener, description: str, permissions: list[str], expires_in_days: str = ""):
    # Fetch tokens page
    r = opener.open(f"{BASE}/security/api-tokens", timeout=20)
    body = r.read().decode()
    csrf = get_csrf_from_meta(body)
    comp = find_component(body, "security.api-tokens")
    if not comp:
        raise RuntimeError("security.api-tokens component not found")

    payload = {
        "_token": csrf,
        "components": [
            {
                "snapshot": comp["snapshot_raw"],
                "updates": {
                    "description": description,
                    "expiresInDays": expires_in_days,
                    "permissions": permissions,
                },
                "calls": [
                    {"path": "", "method": "addNewToken", "params": []},
                ],
            }
        ],
    }
    body_bytes = json.dumps(payload).encode()
    req = urllib.request.Request(f"{BASE}/livewire/update", data=body_bytes, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-CSRF-TOKEN", csrf)
    req.add_header("X-Livewire", "")
    try:
        r = opener.open(req, timeout=20)
        resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:600]}", file=sys.stderr)
        raise

    # Inspect response — look for the new token value in effects.dispatches / data
    effects = resp.get("components", [{}])[0].get("effects", {})
    data = resp.get("components", [{}])[0].get("data", {})
    return resp, effects, data


def main():
    email = os.getenv("COOLIFY_ADMIN_EMAIL")
    password = os.getenv("COOLIFY_ADMIN_PASSWORD")
    if not email or not password:
        if len(sys.argv) >= 3:
            email, password = sys.argv[1], sys.argv[2]
    if not email or not password:
        print("ERROR: set COOLIFY_ADMIN_EMAIL + COOLIFY_ADMIN_PASSWORD env vars", file=sys.stderr)
        return 1

    opener, _ = login(email, password)
    print(f"[login] OK as {email}")

    resp, effects, data = create_token(
        opener,
        description="bumblebee-deploy",
        permissions=["root"],
        expires_in_days="",  # Never
    )
    print("[livewire response keys]:", list(resp.keys()))
    print("[effects keys]:", list(effects.keys()) if isinstance(effects, dict) else effects)
    print("[data preview]:", json.dumps(data, indent=2)[:1500])
    # Save full response for inspection
    with open("coolify-token-response.json", "w", encoding="utf-8") as f:
        json.dump(resp, f, indent=2)
    print("[saved] coolify-token-response.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
