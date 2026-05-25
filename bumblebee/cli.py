"""Bumblebee v3 CLI entry — `bumblebee` console script."""
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from bumblebee import __version__
from bumblebee.config import get_settings

app = typer.Typer(
    name="bumblebee",
    help="Bumblebee v3 — multi-agent concurrent task management platform",
    no_args_is_help=True,
)
db_app = typer.Typer(name="db", help="Database operations")
plugins_app = typer.Typer(name="plugins", help="Plugin management")
issue_app = typer.Typer(name="issue", help="Issue commands")
chat_app = typer.Typer(name="chat", help="ChatSession commands")
app.add_typer(db_app)
app.add_typer(plugins_app)
app.add_typer(issue_app)
app.add_typer(chat_app)

# MCP server commands (Phase B)
try:
    from bumblebee_mcp.cli import app as mcp_app
    app.add_typer(mcp_app, name="mcp", help="MCP server (Claude Code / Desktop / Cursor integration)")
except ImportError:
    pass

# Eval commands (Phase C)
eval_app = typer.Typer(name="eval", help="Prompt + workflow evaluation harness")
app.add_typer(eval_app)


@eval_app.command("prompts")
def eval_prompts() -> None:
    """Validate all YAML prompts against schema + few-shot examples. Exits 1 on error."""
    from bumblebee.prompts.validator import main as run_validator
    raise typer.Exit(run_validator())


@eval_app.command("list-roles")
def eval_list_roles() -> None:
    """Print available agent roles + their key metrics."""
    from bumblebee.prompts import get_prompt, list_roles
    table = Table(title="Bumblebee agent roles")
    table.add_column("role", style="cyan")
    table.add_column("display name")
    table.add_column("tokens_max", justify="right")
    table.add_column("$ max", justify="right")
    table.add_column("tools", justify="right")
    for r in list_roles():
        p = get_prompt(r)
        table.add_row(
            r,
            p.display_name,
            str(p.budgets.get("tokens_max", "—")),
            f"${p.budgets.get('dollars_max', 0):.2f}",
            str(len(p.tools_allowed)),
        )
    console.print(table)

console = Console()


@app.command()
def version() -> None:
    """Print bumblebee version."""
    console.print(f"bumblebee-ai [bold cyan]{__version__}[/bold cyan]")


@app.command()
def init() -> None:
    """Initialize ~/.bumblebee/ + copy .env template."""
    home = Path.home() / ".bumblebee"
    home.mkdir(parents=True, exist_ok=True)
    env_target = home / ".env"
    if env_target.exists():
        console.print(f"[yellow]Already exists:[/yellow] {env_target}")
        return
    sample = Path(__file__).parent.parent / ".env.example"
    if sample.exists():
        env_target.write_text(sample.read_text(encoding="utf-8"), encoding="utf-8")
        console.print(f"[green]Created:[/green] {env_target}")
    else:
        env_target.write_text("# Edit settings here\n", encoding="utf-8")
        console.print(f"[green]Created empty:[/green] {env_target}")


@db_app.command("migrate")
def db_migrate() -> None:
    """Run alembic upgrade head."""
    project_root = Path(__file__).parent.parent
    code = subprocess.call(["alembic", "upgrade", "head"], cwd=str(project_root))
    raise typer.Exit(code)


@db_app.command("seed")
def db_seed() -> None:
    """Run default seed."""
    from bumblebee.seeds.seed_default import seed

    asyncio.run(seed())


@db_app.command("reset")
def db_reset(confirm: bool = typer.Option(False, "--yes", help="Skip confirm prompt")) -> None:
    """⚠ Drop + recreate all tables. Destructive!"""
    if not confirm:
        if not typer.confirm("⚠  This DROPS all tables. Continue?"):
            raise typer.Abort()
    project_root = Path(__file__).parent.parent
    subprocess.call(["alembic", "downgrade", "base"], cwd=str(project_root))
    subprocess.call(["alembic", "upgrade", "head"], cwd=str(project_root))
    console.print("[green]reset complete[/green]")


@app.command()
def server(
    host: str = typer.Option("0.0.0.0", "--host"),
    port: int = typer.Option(8000, "--port"),
    reload: bool = typer.Option(False, "--reload"),
) -> None:
    """Start FastAPI server."""
    import uvicorn

    uvicorn.run("bumblebee.main:app", host=host, port=port, reload=reload)


@app.command()
def daemon(
    server_url: str = typer.Option("http://localhost:8000", "--server"),
    config: str = typer.Option("~/.bumblebee/node.json", "--config"),
    poll_interval: float = typer.Option(3.0, "--interval"),
) -> None:
    """Start worker daemon: long-poll server for tasks and execute them locally."""
    from bumblebee.worker.daemon import run_daemon
    asyncio.run(run_daemon(server_url, Path(config).expanduser(), poll_interval))


skills_app = typer.Typer(name="skills", help="Bundle Bumblebee roles for external AI agents")
app.add_typer(skills_app)


@skills_app.command("install")
def skills_install(
    target: str = typer.Option(
        "claude-code", "--target", "-t",
        help="claude-code | cursor | codex | generic",
    ),
    repo: str = typer.Option(".", "--repo", "-r", help="Repo to install into"),
) -> None:
    """Install Bumblebee role prompts + workflows into an external AI agent toolchain.

    Examples:
      bb skills install                                  # Claude Code, current repo
      bb skills install -t cursor -r ../some-other-repo
      bb skills install -t codex
    """
    from bumblebee.installer import TARGETS, install_bundle
    if target not in TARGETS:
        console.print(f"[red]unknown target: {target}[/red]. choices: {list(TARGETS)}")
        raise typer.Exit(2)
    written = install_bundle(target, Path(repo).resolve())
    console.print(f"[green]installed {len(written)} file(s)[/green] for target [cyan]{target}[/cyan]:")
    for p in written:
        console.print(f"  • {p}")


@skills_app.command("targets")
def skills_targets() -> None:
    """List available install targets."""
    from bumblebee.installer import TARGETS
    table = Table(title="Bumblebee bundle targets")
    table.add_column("key", style="cyan")
    table.add_column("description")
    for k, t in TARGETS.items():
        table.add_row(k, t.label)
    console.print(table)


device_app = typer.Typer(name="device", help="Device pairing for worker daemon")
app.add_typer(device_app)


@device_app.command("pair")
def device_pair(
    server_url: str = typer.Option("http://localhost:8000", "--server"),
    name: str = typer.Option(None, "--name", help="Device label (default: hostname)"),
    workspace: str = typer.Option(None, "--workspace", help="Workspace slug"),
    config: str = typer.Option("~/.bumblebee/node.json", "--config"),
) -> None:
    """Request pairing; print code; wait for user to confirm in web UI."""
    import json
    import platform
    import socket

    import httpx
    cfg = Path(config).expanduser()
    cfg.parent.mkdir(parents=True, exist_ok=True)

    body = {
        "name": name or socket.gethostname(),
        "capabilities": ["claude-cli", "git"],
        "hostname": socket.gethostname(),
        "platform": platform.system().lower(),
        "workspace_slug": workspace,
    }
    r = httpx.post(f"{server_url}/api/devices/pair-request", json=body, timeout=15)
    r.raise_for_status()
    data = r.json()
    code = data["pairing_code"]
    node_id = data["node_id"]

    console.print(f"\n[bold yellow]Pairing code: [white on blue] {code} [/white on blue][/bold yellow]")
    console.print(f"Open {server_url.replace(':8000', ':3000')}/settings/devices and confirm this code (10 min).")
    console.print(f"Node ID: {node_id}\n")
    console.print("Waiting for confirmation... (Ctrl+C to cancel)")

    # Poll for confirmation by listing nodes (need a separate auth) — simpler:
    # write a stub config with node_id; user re-runs `bb device save-token` after confirm.
    cfg.write_text(json.dumps({
        "server_url": server_url,
        "node_id": node_id,
        "status": "pending",
        "pairing_code": code,
    }, indent=2))
    console.print(f"[dim]stub config written to {cfg}. Run `bb device save-token <token>` after confirming in web.[/dim]")


@device_app.command("save-token")
def device_save_token(
    token: str = typer.Argument(..., help="Raw node token from web UI"),
    config: str = typer.Option("~/.bumblebee/node.json", "--config"),
) -> None:
    import json
    cfg = Path(config).expanduser()
    data = json.loads(cfg.read_text()) if cfg.exists() else {}
    data["node_token"] = token
    data["status"] = "active"
    cfg.write_text(json.dumps(data, indent=2))
    console.print(f"[green]token saved[/green] at {cfg}")


@plugins_app.command("list")
def plugins_list() -> None:
    """List installed plugins."""
    from importlib.metadata import entry_points

    eps = list(entry_points(group="bumblebee.plugins"))
    table = Table(title="Plugins")
    table.add_column("Name", style="cyan")
    table.add_column("Module", style="magenta")
    table.add_column("Status", style="green")
    if not eps:
        table.add_row("(none)", "", "")
    else:
        for ep in eps:
            try:
                ep.load()
                table.add_row(ep.name, ep.value, "loaded")
            except Exception as e:
                table.add_row(ep.name, ep.value, f"[red]failed: {e}[/red]")
    console.print(table)


@plugins_app.command("reload")
def plugins_reload() -> None:
    """Reload plugins (re-discover entry_points + re-register)."""
    import httpx

    settings = get_settings()
    url = f"http://{settings.api_host}:{settings.api_port}/api/plugins/reload"
    try:
        r = httpx.post(url, timeout=30)
        if r.status_code == 200:
            console.print(f"[green]reload ok[/green]: {r.json()}")
        else:
            console.print(f"[red]error {r.status_code}[/red]: {r.text}")
            raise typer.Exit(1)
    except httpx.ConnectError:
        console.print(f"[red]server not reachable[/red] at {url}")
        raise typer.Exit(1)


@issue_app.command("list")
def issue_list(
    project: str = typer.Option("bb", "--project", "-p"),
    status: str | None = typer.Option(None, "--status"),
    server: str | None = typer.Option(None, "--server"),
) -> None:
    """List issues (via GraphQL)."""
    from bumblebee.cli_client import GraphQLClient

    client = GraphQLClient.from_env_or_config(server_url=server)
    # Resolve project by slug to get UUID
    proj_data = client.query(
        "query($s: String!) { projects { id slug } }",
        variables={"s": project},
    )
    pid = next((p["id"] for p in proj_data["projects"] if p["slug"] == project), None)
    if not pid:
        console.print(f"[red]project not found:[/red] {project}")
        raise typer.Exit(1)
    issues_data = client.query(
        "query($pid: UUID!, $status: String) { issues(projectId: $pid, status: $status, limit: 100) { number status title complexity } }",
        variables={"pid": pid, "status": status},
    )
    table = Table()
    table.add_column("Key", style="cyan")
    table.add_column("Status", style="yellow")
    table.add_column("Cx", style="magenta")
    table.add_column("Title")
    for item in issues_data["issues"]:
        table.add_row(
            f"BB-{item['number']}",
            item["status"],
            item.get("complexity") or "-",
            (item["title"] or "")[:60],
        )
    console.print(table)


@issue_app.command("create")
def issue_create(
    title: str = typer.Argument(...),
    project: str = typer.Option("bb", "--project", "-p"),
    type: str = typer.Option("TASK", "--type", "-t"),
    priority: str = typer.Option("MEDIUM", "--priority"),
    server: str | None = typer.Option(None, "--server"),
) -> None:
    """Create an issue (via GraphQL)."""
    from bumblebee.cli_client import GraphQLClient

    client = GraphQLClient.from_env_or_config(server_url=server)
    proj_data = client.query("{ projects { id slug } }")
    pid = next((p["id"] for p in proj_data["projects"] if p["slug"] == project), None)
    if not pid:
        console.print(f"[red]project not found:[/red] {project}")
        raise typer.Exit(1)
    data = client.query(
        "mutation($i: IssueCreateInput!) { createIssue(input: $i) { number title status } }",
        variables={"i": {"projectId": pid, "title": title, "type": type.upper(), "priority": priority.upper()}},
    )
    d = data["createIssue"]
    console.print(f"[green]created BB-{d['number']}:[/green] {d['title']} (status={d['status']})")


@app.command()
def whoami(server: str | None = typer.Option(None, "--server")) -> None:
    """Print current workspace (via GraphQL `me` query)."""
    from bumblebee.cli_client import GraphQLClient
    client = GraphQLClient.from_env_or_config(server_url=server)
    data = client.query("{ me { id name slug plan paymentOverdue } }")
    if not data.get("me"):
        console.print("[yellow]no workspace bound to current token[/yellow]")
        raise typer.Exit(1)
    me = data["me"]
    console.print(f"[cyan]workspace:[/cyan] {me['name']} ({me['slug']})")
    console.print(f"  id:      {me['id']}")
    console.print(f"  plan:    {me['plan']}")
    console.print(f"  overdue: {me['paymentOverdue']}")


@app.command()
def login(
    username: str = typer.Argument(...),
    password: str = typer.Option(..., "--password", "-p", prompt=True, hide_input=True),
    server: str = typer.Option("http://localhost:8000", "--server"),
    config: str = typer.Option("~/.bumblebee/cli.json", "--config"),
) -> None:
    """Login (via GraphQL) and store token in ~/.bumblebee/cli.json."""
    import json

    from bumblebee.cli_client import GraphQLClient
    client = GraphQLClient(endpoint=server.rstrip("/") + "/graphql")
    data = client.query(
        "mutation($i: LoginInput!) { login(input: $i) { accessToken user { username } workspace { name slug plan } } }",
        variables={"i": {"username": username, "password": password}},
    )
    out = data["login"]
    cfg = Path(config).expanduser()
    cfg.parent.mkdir(parents=True, exist_ok=True)
    cfg.write_text(json.dumps({
        "server_url": server, "access_token": out["accessToken"],
        "username": out["user"]["username"],
        "workspace": out.get("workspace"),
    }, indent=2))
    console.print(f"[green]logged in as[/green] {out['user']['username']}, "
                  f"workspace={out['workspace']['name'] if out.get('workspace') else 'none'}")
    console.print(f"[dim]token cached at {cfg}[/dim]")


@chat_app.command("send")
def chat_send(
    text: str = typer.Argument(...),
    session_id: str | None = typer.Option(None, "--session"),
    project: str = typer.Option("bb", "--project", "-p"),
) -> None:
    """Send a chat message (creates session if --session not given)."""
    import httpx

    settings = get_settings()
    base = f"http://{settings.api_host}:{settings.api_port}/api/projects/{project}/chat"
    if not session_id:
        r = httpx.post(f"{base}/sessions", json={"title": text[:40], "source": "cli"}, timeout=10)
        session_id = r.json()["id"]
        console.print(f"[dim]created session {session_id}[/dim]")
    r = httpx.post(f"{base}/sessions/{session_id}/messages", json={"content": text}, timeout=30)
    if r.status_code == 200:
        console.print(f"[cyan]Assistant:[/cyan] {r.json()['reply']}")
    else:
        console.print(f"[red]error:[/red] {r.text}")
        raise typer.Exit(1)


@app.command()
def replay(
    session_id: str = typer.Argument(...),
    from_checkpoint: str | None = typer.Option(None, "--from-checkpoint"),
) -> None:
    """Replay a session (Phase 7 — currently stub)."""
    console.print(f"[yellow]replay: not yet implemented (Phase 7)[/yellow] session={session_id}")
    raise typer.Exit(1)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
