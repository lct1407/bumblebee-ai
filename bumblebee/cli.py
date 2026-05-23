"""Bumblebee v3 CLI entry — `bumblebee` console script."""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
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
    from bumblebee.prompts import list_roles, get_prompt
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
def daemon() -> None:
    """Start worker daemon (Phase 1.5+ — currently stub)."""
    console.print("[yellow]daemon: not yet implemented (Phase 1.5+)[/yellow]")
    raise typer.Exit(1)


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
) -> None:
    """List issues."""
    import httpx

    settings = get_settings()
    url = f"http://{settings.api_host}:{settings.api_port}/api/projects/{project}/issues"
    if status:
        url += f"?status={status}"
    r = httpx.get(url, timeout=10)
    if r.status_code != 200:
        console.print(f"[red]error:[/red] {r.text}")
        raise typer.Exit(1)
    table = Table()
    table.add_column("Key", style="cyan")
    table.add_column("Status", style="yellow")
    table.add_column("Title")
    for item in r.json():
        table.add_row(
            f"BB-{item['number']}", item["status"], item["title"][:60]
        )
    console.print(table)


@issue_app.command("create")
def issue_create(
    title: str = typer.Argument(...),
    project: str = typer.Option("bb", "--project", "-p"),
    type: str = typer.Option("task", "--type", "-t"),
    priority: str = typer.Option("medium", "--priority"),
) -> None:
    """Create an issue."""
    import httpx

    settings = get_settings()
    url = f"http://{settings.api_host}:{settings.api_port}/api/projects/{project}/issues"
    r = httpx.post(url, json={"title": title, "type": type, "priority": priority}, timeout=10)
    if r.status_code == 201:
        d = r.json()
        console.print(f"[green]created BB-{d['number']}:[/green] {d['title']}")
    else:
        console.print(f"[red]error {r.status_code}:[/red] {r.text}")
        raise typer.Exit(1)


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
