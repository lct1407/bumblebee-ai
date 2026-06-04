"""Bootstrap Coolify deployment for bumblebee.

Logs into Coolify web, creates an API token via Livewire form, then uses that
token to provision the application (docker-compose source), set env vars,
fetch deploy webhook, and save it as a GitHub secret.

Credentials are read from environment, NOT committed. Set:
    COOLIFY_ADMIN_EMAIL, COOLIFY_ADMIN_PASSWORD
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
    r = opener.open(req, timeout=20)
    assert r.status == 200, f"Login failed: {r.status}"
    print(f"[login] OK as {email}")
    return opener, cj


def get_csrf(opener) -> str:
    r = opener.open(f"{BASE}/security/api-tokens", timeout=20)
    body = r.read().decode()
    m = re.search(r'name="csrf-token"\s+content="([^"]+)"', body)
    if not m:
        m = re.search(r'name="_token"\s+value="([^"]+)"', body)
    return m.group(1) if m else None, body


def find_snapshot(body: str, component_name: str):
    for s in re.finditer(r'wire:snapshot="([^"]+)"', body):
        sn = html.unescape(s.group(1))
        try:
            snap = json.loads(sn)
            if snap.get("memo", {}).get("name") == component_name:
                return snap, s.start()
        except Exception:
            continue
    return None, -1


def dump_api_tokens_form(opener):
    csrf, body = get_csrf(opener)
    snap, pos = find_snapshot(body, "security.api-tokens")
    if not snap:
        print("[ERR] security.api-tokens component not found")
        return None
    print(f"[snapshot] memo: {snap['memo']}")
    print(f"[snapshot] data: {list(snap['data'].keys())}")
    # Inspect surrounding HTML for buttons
    chunk = body[pos:pos + 30000]
    actions = set()
    for c in re.finditer(r'(wire:click|wire:submit)\s*=\s*"([^"]{1,150})"', chunk):
        actions.add((c.group(1), c.group(2)))
    print("[actions]")
    for a in sorted(actions):
        print(f"  {a[0]} = {a[1]}")
    # Save for inspection
    with open("coolify-tokens-debug.html", "w", encoding="utf-8") as f:
        f.write(body)
    return snap


def main():
    email = os.getenv("COOLIFY_ADMIN_EMAIL")
    password = os.getenv("COOLIFY_ADMIN_PASSWORD")
    if not email and len(sys.argv) > 1:
        email = sys.argv[1]
    if not password and len(sys.argv) > 2:
        password = sys.argv[2]
    if not email or not password:
        print("Usage: COOLIFY_ADMIN_EMAIL=... COOLIFY_ADMIN_PASSWORD=... python coolify-bootstrap.py")
        return 1
    opener, _ = login(email, password)
    dump_api_tokens_form(opener)
    return 0


if __name__ == "__main__":
    sys.exit(main())
