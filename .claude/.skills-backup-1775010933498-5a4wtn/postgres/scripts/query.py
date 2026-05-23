#!/usr/bin/env python3
"""
Bumblebee PostgreSQL read-only query tool.

Executes safe, read-only SQL queries against the Bumblebee PostgreSQL database.
Connection info is read from api/.env (DATABASE_URL).

Usage:
    python3 .claude/skills/postgres/scripts/query.py --tables
    python3 .claude/skills/postgres/scripts/query.py --schema <table_name>
    python3 .claude/skills/postgres/scripts/query.py --query "SELECT * FROM work_items LIMIT 10"
    python3 .claude/skills/postgres/scripts/query.py --query "SELECT * FROM work_items" --limit 50
"""

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_ROWS = 10000
DEFAULT_TIMEOUT_MS = 30000  # 30 seconds

ALLOWED_PREFIXES = ("select", "show", "explain", "with")

BLOCKED_KEYWORDS = (
    "insert",
    "update",
    "delete",
    "drop",
    "create",
    "alter",
    "truncate",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def find_env_file() -> Path:
    """Locate api/.env relative to the repository root."""
    # Walk upward from this script to find the repo root (contains api/.env)
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        candidate = parent / "api" / ".env"
        if candidate.is_file():
            return candidate
    # Fallback: try cwd-based path
    cwd_candidate = Path.cwd() / "api" / ".env"
    if cwd_candidate.is_file():
        return cwd_candidate
    print("Error: Could not find api/.env file.", file=sys.stderr)
    print(
        "Make sure you run this script from the bumblebee-cli repository root,",
        file=sys.stderr,
    )
    print(
        "or that api/.env exists relative to the script location.",
        file=sys.stderr,
    )
    sys.exit(1)


def read_database_url(env_path: Path) -> str:
    """Parse DATABASE_URL from a .env file."""
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("DATABASE_URL="):
                value = line[len("DATABASE_URL="):]
                # Strip optional surrounding quotes
                if (value.startswith('"') and value.endswith('"')) or (
                    value.startswith("'") and value.endswith("'")
                ):
                    value = value[1:-1]
                return value
    print("Error: DATABASE_URL not found in %s" % env_path, file=sys.stderr)
    sys.exit(1)


def to_psycopg2_dsn(database_url: str) -> str:
    """
    Convert a SQLAlchemy-style DATABASE_URL to a psycopg2-compatible DSN.

    Handles schemes like:
      - postgresql+asyncpg://user:pass@host:port/db
      - postgresql://user:pass@host:port/db
    """
    # Normalize scheme to plain postgresql://
    url = re.sub(r"^postgresql\+\w+://", "postgresql://", database_url)
    parsed = urlparse(url)

    parts = {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "dbname": (parsed.path or "/").lstrip("/"),
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
    }

    dsn = " ".join(f"{k}={v}" for k, v in parts.items() if v)
    return dsn


def validate_query(sql: str) -> None:
    """
    Validate that the SQL is a single, read-only statement.
    Raises SystemExit on violation.
    """
    stripped = sql.strip().rstrip(";").strip()

    # Block empty queries
    if not stripped:
        print("Error: Empty query.", file=sys.stderr)
        sys.exit(1)

    # Block multiple statements (naive check: semicolons not inside quotes)
    # Remove string literals before checking for semicolons
    no_strings = re.sub(r"'[^']*'", "", stripped)
    no_strings = re.sub(r'"[^"]*"', "", no_strings)
    if ";" in no_strings:
        print(
            "Error: Multiple statements are not allowed. Submit one query at a time.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Check the first keyword
    first_word = stripped.split()[0].lower() if stripped.split() else ""

    if first_word in BLOCKED_KEYWORDS:
        print(
            "Error: Write operation blocked. Only SELECT, SHOW, EXPLAIN, and WITH "
            "statements are allowed. Got: %s" % first_word.upper(),
            file=sys.stderr,
        )
        sys.exit(1)

    if first_word not in ALLOWED_PREFIXES:
        print(
            "Error: Unsupported statement type '%s'. "
            "Only SELECT, SHOW, EXPLAIN, and WITH are allowed." % first_word.upper(),
            file=sys.stderr,
        )
        sys.exit(1)

    # Extra safety: scan for write keywords anywhere (e.g. inside CTEs)
    lower_sql = stripped.lower()
    for kw in BLOCKED_KEYWORDS:
        # Match as whole word to avoid false positives (e.g. "updated_at")
        pattern = r"\b" + kw + r"\b"
        # Allow these keywords in quoted identifiers and string literals
        # by checking the cleaned version
        no_strings_lower = no_strings.lower()
        if re.search(pattern, no_strings_lower):
            # Exclude common false positives in column names
            # Only flag if it looks like a statement keyword (followed by space/tab or end)
            # For DELETE/UPDATE/INSERT, check if used as a command (not column reference)
            if kw in ("delete", "update", "insert"):
                # Allow "deleted_at", "updated_at", etc. but block "DELETE FROM"
                command_pattern = r"\b" + kw + r"\s+(from|into|set|table)\b"
                if re.search(command_pattern, no_strings_lower):
                    print(
                        "Error: Write operation '%s' detected in query. "
                        "Only read-only queries are allowed." % kw.upper(),
                        file=sys.stderr,
                    )
                    sys.exit(1)
            else:
                print(
                    "Error: Blocked keyword '%s' detected in query. "
                    "Only read-only queries are allowed." % kw.upper(),
                    file=sys.stderr,
                )
                sys.exit(1)


def format_results(columns: list, rows: list) -> str:
    """Format query results as a table."""
    try:
        from tabulate import tabulate

        return tabulate(rows, headers=columns, tablefmt="psql")
    except ImportError:
        # Fallback: simple tab-separated output
        lines = []
        lines.append("\t".join(str(c) for c in columns))
        lines.append("\t".join("-" * max(len(str(c)), 4) for c in columns))
        for row in rows:
            lines.append("\t".join(str(v) for v in row))
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Query functions
# ---------------------------------------------------------------------------


def connect(dsn: str):
    """Create a psycopg2 connection with read-only session settings."""
    try:
        import psycopg2
    except ImportError:
        print(
            "Error: psycopg2 is not installed. Install it with:\n"
            "  pip install psycopg2-binary",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        conn = psycopg2.connect(dsn)
    except Exception as e:
        print("Error: Could not connect to database: %s" % e, file=sys.stderr)
        sys.exit(1)

    conn.autocommit = True
    cur = conn.cursor()

    # Set session to read-only
    cur.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;")

    # Set statement timeout
    cur.execute("SET statement_timeout = %s;", (DEFAULT_TIMEOUT_MS,))

    return conn


def list_tables(conn) -> None:
    """List all user tables in the public schema."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
        """
    )
    rows = cur.fetchall()
    columns = ["table_name", "size"]
    print(format_results(columns, rows))
    print("\n%d table(s) found." % len(rows))


def show_schema(conn, table_name: str) -> None:
    """Show column details for a specific table."""
    # Validate table name to prevent injection
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table_name):
        print("Error: Invalid table name '%s'." % table_name, file=sys.stderr)
        sys.exit(1)

    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
        ORDER BY ordinal_position;
        """,
        (table_name,),
    )
    rows = cur.fetchall()

    if not rows:
        print("Error: Table '%s' not found or has no columns." % table_name, file=sys.stderr)
        sys.exit(1)

    columns = ["column_name", "data_type", "nullable", "default", "max_length"]
    print(format_results(columns, rows))

    # Show indexes
    cur.execute(
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = %s
        ORDER BY indexname;
        """,
        (table_name,),
    )
    idx_rows = cur.fetchall()
    if idx_rows:
        print("\nIndexes:")
        print(format_results(["index_name", "definition"], idx_rows))

    # Show foreign keys
    cur.execute(
        """
        SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = %s;
        """,
        (table_name,),
    )
    fk_rows = cur.fetchall()
    if fk_rows:
        print("\nForeign Keys:")
        print(
            format_results(
                ["constraint", "column", "foreign_table", "foreign_column"],
                fk_rows,
            )
        )


def run_query(conn, sql: str, limit: int) -> None:
    """Execute a validated read-only query and print results."""
    validate_query(sql)

    cur = conn.cursor()
    try:
        cur.execute(sql)
    except Exception as e:
        print("Error executing query: %s" % e, file=sys.stderr)
        sys.exit(1)

    if cur.description is None:
        print("Query executed successfully (no result set).")
        return

    columns = [desc[0] for desc in cur.description]
    rows = cur.fetchmany(limit)
    total_fetched = len(rows)

    print(format_results(columns, rows))

    # Check if there are more rows
    extra = cur.fetchone()
    if extra:
        print(
            "\n(Results truncated at %d rows. Use --limit to adjust, max %d.)"
            % (limit, MAX_ROWS)
        )
    else:
        print("\n%d row(s) returned." % total_fetched)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Bumblebee PostgreSQL read-only query tool.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --tables
  %(prog)s --schema work_items
  %(prog)s --query "SELECT * FROM work_items WHERE status = 'open' LIMIT 10"
  %(prog)s --query "SELECT count(*) FROM work_items" --limit 1
        """,
    )
    parser.add_argument(
        "--tables",
        action="store_true",
        help="List all tables in the public schema",
    )
    parser.add_argument(
        "--schema",
        metavar="TABLE",
        help="Show schema (columns, indexes, foreign keys) for a table",
    )
    parser.add_argument(
        "--query",
        metavar="SQL",
        help="Execute a read-only SQL query",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=MAX_ROWS,
        help="Maximum number of rows to return (default: %d)" % MAX_ROWS,
    )

    args = parser.parse_args()

    # Validate that at least one action is specified
    if not args.tables and not args.schema and not args.query:
        parser.print_help()
        sys.exit(1)

    # Clamp limit
    if args.limit < 1:
        args.limit = 1
    if args.limit > MAX_ROWS:
        print(
            "Warning: Limit capped at %d rows." % MAX_ROWS,
            file=sys.stderr,
        )
        args.limit = MAX_ROWS

    # Read connection info
    env_path = find_env_file()
    database_url = read_database_url(env_path)
    dsn = to_psycopg2_dsn(database_url)

    # Connect
    conn = connect(dsn)

    try:
        if args.tables:
            list_tables(conn)
        elif args.schema:
            show_schema(conn, args.schema)
        elif args.query:
            run_query(conn, args.query, args.limit)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
