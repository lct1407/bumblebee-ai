#!/usr/bin/env python3
"""
Sync local .claude/skills/ to Strapi backend via REST API.

Usage:
  python3 sync.py [--dry-run] [--skill NAME] [--push-all]

Env vars:
  STRAPI_URL   — Base URL (default: auto-detect localhost/WSL host on port 1337)
  STRAPI_TOKEN — API token for auth (required)
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

DEFAULT_PORT = 1337
DEFAULT_TOKEN = 'bb8364cad2a9249a0cee36d1cbe9373062630d9a4a286eaaa35f3a3d584d2ceaafd74406c6c46536f06bfb4824477cc049e578efa69a92a3b77f04650a13b86023fdd7486bb953567a2ae557ac67bbdf87878567a3e7e696b826947d5f4fbf22e26d534a1257ce96ec7d5bfa289f010ba0edac65a43ecc168c520fbf6429831c'
DEFAULT_URL = 'https://forge-api.sidcorp.co'
SKIP_SKILLS = {'forge-skill'}
SKIP_FILES = {'__pycache__', '.pyc', 'Zone.Identifier', '.DS_Store', 'node_modules'}
BINARY_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot',
               '.zip', '.tar', '.gz', '.pdf', '.webp', '.svg', '.mp3', '.mp4'}


def get_default_host() -> str:
    env_host = os.environ.get('STRAPI_HOST')
    if env_host:
        return env_host
    if os.path.exists('/etc/resolv.conf'):
        try:
            with open('/etc/resolv.conf', 'r') as f:
                for line in f:
                    if line.startswith('nameserver'):
                        windows_ip = line.split()[1]
                        import socket
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(1)
                        result = sock.connect_ex((windows_ip, DEFAULT_PORT))
                        sock.close()
                        if result == 0:
                            return windows_ip
        except Exception:
            pass
    return 'localhost'


def get_base_url() -> str:
    return os.environ.get('STRAPI_URL', DEFAULT_URL)


def api_request(url: str, token: str, method: str = 'GET', data: dict | None = None) -> dict:
    headers = {'Content-Type': 'application/json', 'User-Agent': 'forge-skill-sync/1.0'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ''
        print(f"  HTTP {e.code}: {err_body[:200]}", file=sys.stderr)
        raise


def should_skip_file(path: str) -> bool:
    parts = Path(path).parts
    return any(skip in parts or path.endswith(skip) for skip in SKIP_FILES)


def read_skill_dir(skill_dir: Path) -> dict | None:
    """Read a local skill directory into {name, skillMd, description, version, files}."""
    skill_md_path = skill_dir / 'SKILL.md'
    if not skill_md_path.exists():
        return None

    skill_md = skill_md_path.read_text(encoding='utf-8')

    # Parse frontmatter
    name = skill_dir.name
    description = ''
    version = '1.0.0'
    if skill_md.startswith('---'):
        end = skill_md.find('---', 3)
        if end > 0:
            front = skill_md[3:end]
            for line in front.strip().splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    k, v = k.strip(), v.strip()
                    if k == 'name':
                        name = v
                    elif k == 'description':
                        description = v
                    elif k == 'version':
                        version = v

    # Collect all files except SKILL.md itself
    files = []
    for fpath in sorted(skill_dir.rglob('*')):
        if fpath.is_dir() or fpath == skill_md_path:
            continue
        rel = str(fpath.relative_to(skill_dir))
        if should_skip_file(rel):
            continue
        ext = fpath.suffix.lower()
        if ext in BINARY_EXTS:
            content = base64.b64encode(fpath.read_bytes()).decode('ascii')
            encoding = 'base64'
        else:
            try:
                content = fpath.read_text(encoding='utf-8')
                encoding = 'utf8'
            except UnicodeDecodeError:
                content = base64.b64encode(fpath.read_bytes()).decode('ascii')
                encoding = 'base64'
        files.append({'path': rel, 'content': content, 'encoding': encoding})

    return {
        'name': name,
        'description': description,
        'version': version,
        'skillMd': skill_md,
        'files': files,
    }


def content_hash(skill_data: dict) -> str:
    """Hash skillMd + files for comparison."""
    h = hashlib.sha256()
    h.update(skill_data['skillMd'].encode())
    for f in sorted(skill_data['files'], key=lambda x: x['path']):
        h.update(f['path'].encode())
        h.update(f['content'].encode())
    return h.hexdigest()[:16]


def fetch_remote_skills(base_url: str, token: str) -> dict[str, dict]:
    """Fetch all remote skills, return {name: {documentId, version, skillMd, files}}."""
    url = f'{base_url}/api/skills?pagination[pageSize]=100&filters[isGlobal][$eq]=true'
    resp = api_request(url, token)
    result = {}
    for item in resp.get('data', []):
        result[item['name']] = {
            'documentId': item['documentId'],
            'version': item.get('version', '1.0.0'),
            'skillMd': item.get('skillMd', ''),
            'files': item.get('files') or [],
        }
    return result


def push_skill(base_url: str, token: str, skill_data: dict, doc_id: str | None = None) -> dict:
    """Create or update a skill."""
    payload = {
        'data': {
            'name': skill_data['name'],
            'description': skill_data['description'],
            'skillMd': skill_data['skillMd'],
            'files': skill_data['files'],
            'isGlobal': True,
        }
    }
    if doc_id:
        url = f'{base_url}/api/skills/{doc_id}'
        return api_request(url, token, 'PUT', payload)
    else:
        url = f'{base_url}/api/skills'
        return api_request(url, token, 'POST', payload)


def main():
    parser = argparse.ArgumentParser(description='Sync local skills to Strapi')
    parser.add_argument('--dry-run', action='store_true', help='Show what would change without pushing')
    parser.add_argument('--skill', type=str, help='Target a specific skill name')
    parser.add_argument('--push-all', action='store_true', help='Push all skills even if unchanged')
    parser.add_argument('--read', action='store_true', help='Read and display a skill (use with --skill)')
    args = parser.parse_args()

    token = os.environ.get('STRAPI_TOKEN', DEFAULT_TOKEN)
    base_url = get_base_url()
    skills_dir = Path(__file__).resolve().parents[2]  # .claude/skills/

    # Read mode: display skill info and exit
    if args.read:
        if not args.skill:
            print("Error: --read requires --skill NAME", file=sys.stderr)
            sys.exit(1)
        skill_dir = skills_dir / args.skill
        local = read_skill_dir(skill_dir) if skill_dir.is_dir() else None
        if local:
            print(f"=== Local: {local['name']} v{local['version']} ===")
            print(f"Description: {local['description']}")
            print(f"Files: {len(local['files'])}")
            for f in local['files']:
                print(f"  {f['path']} ({f['encoding']}, {len(f['content'])} chars)")
            print(f"Hash: {content_hash(local)}")
        else:
            print(f"No local skill '{args.skill}' found")
        # Also check remote
        print()
        try:
            remote_skills = fetch_remote_skills(base_url, token)
        except Exception as e:
            print(f"Could not fetch remote skills: {e}")
            return
        remote = remote_skills.get(args.skill)
        if remote:
            print(f"=== Remote: {args.skill} v{remote['version']} ===")
            print(f"Files: {len(remote['files'])}")
            for f in remote['files']:
                print(f"  {f['path']} ({f.get('encoding', 'utf8')}, {len(f.get('content', ''))} chars)")
            print(f"Hash: {content_hash({'skillMd': remote['skillMd'], 'files': remote['files']})}")
            if local:
                lh = content_hash(local)
                rh = content_hash({'skillMd': remote['skillMd'], 'files': remote['files']})
                print(f"\nMatch: {'yes' if lh == rh else 'NO — local and remote differ'}")
        else:
            print(f"No remote skill '{args.skill}' found")
        return

    # Discover local skills
    local_skills: dict[str, dict] = {}
    for d in sorted(skills_dir.iterdir()):
        if not d.is_dir() or d.name in SKIP_SKILLS:
            continue
        if args.skill and d.name != args.skill:
            continue
        skill = read_skill_dir(d)
        if skill:
            local_skills[skill['name']] = skill

    if not local_skills:
        print("No local skills found to sync.")
        return

    print(f"Found {len(local_skills)} local skill(s): {', '.join(local_skills.keys())}")
    print(f"Strapi: {base_url}")

    # Fetch remote
    print("Fetching remote skills...")
    remote_skills = fetch_remote_skills(base_url, token)
    print(f"Found {len(remote_skills)} remote skill(s)")

    # Compare and sync
    created, updated, unchanged = 0, 0, 0
    for name, local in local_skills.items():
        remote = remote_skills.get(name)
        local_hash = content_hash(local)

        if remote:
            remote_hash = content_hash({'skillMd': remote['skillMd'], 'files': remote['files']})
            if local_hash == remote_hash and not args.push_all:
                print(f"  {name}: unchanged")
                unchanged += 1
                continue
            print(f"  {name}: changed (local={local_hash}, remote={remote_hash})")
            if not args.dry_run:
                push_skill(base_url, token, local, remote['documentId'])
                print(f"    -> updated")
            updated += 1
        else:
            print(f"  {name}: new")
            if not args.dry_run:
                push_skill(base_url, token, local)
                print(f"    -> created")
            created += 1

    print(f"\nSummary: {created} created, {updated} updated, {unchanged} unchanged"
          + (" (dry-run)" if args.dry_run else ""))


if __name__ == '__main__':
    main()
