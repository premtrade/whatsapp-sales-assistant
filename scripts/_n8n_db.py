"""Shared helpers for the n8n maintenance scripts.

The scripts talk to the n8n Postgres database through the `postgres` docker
container. The password is never stored in the repo: it is read from the
environment (PGPASSWORD / POSTGRES_PASSWORD / N8N_DB_PASSWORD) or from the
deployment's .env file.
"""
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def db_password() -> str:
    for key in ("PGPASSWORD", "POSTGRES_PASSWORD", "N8N_DB_PASSWORD"):
        value = os.environ.get(key)
        if value:
            return value
    env_path = os.path.join(ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("POSTGRES_PASSWORD="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(
        "Postgres password not found. Set PGPASSWORD (or POSTGRES_PASSWORD) "
        "in the environment before running this script."
    )


def db_name(default: str = "n8n") -> str:
    return os.environ.get("N8N_DB_NAME", default)


def run_sql(sql: str, database: str | None = None) -> str:
    """Run SQL inside the `postgres` container and return the raw output."""
    name = database or db_name()
    path = "/tmp/n8n_script.sql"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(sql)
    subprocess.run(["docker", "cp", path, "postgres:/tmp/n8n_script.sql"], check=True)
    res = subprocess.run(
        ["docker", "exec", "-e", f"PGPASSWORD={db_password()}", "postgres",
         "psql", "-U", "postgres", "-d", name, "-tA", "-F", "\t", "-f", "/tmp/n8n_script.sql"],
        capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(res.stderr)
    return res.stdout
