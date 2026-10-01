#!/usr/bin/env python
"""Run SQL against the live n8n Postgres via stdin (avoids shell quoting issues).

Usage:
    python scripts/q.py "SELECT 1;"
    python scripts/q.py --file scripts/_tmp_meta.sql
    Get-Content x.sql | python scripts/q.py --stdin
"""
import subprocess
import sys

PSQL = [
    "docker", "compose", "exec", "-T",
    "-e", "PGPASSWORD=WafloFix2026",
    "postgres", "psql", "-U", "postgres", "-d", "n8n", "-v", "ON_ERROR_STOP=1",
]


def run(sql: str, flags: list[str] | None = None) -> tuple[int, str, str]:
    args = [sys.executable, "-c", "pass"] if False else []
    cmd = PSQL + (flags or [])
    p = subprocess.run(cmd, input=sql, capture_output=True, text=True, encoding="utf-8")
    return p.returncode, p.stdout, p.stderr


def main() -> int:
    flags: list[str] = []
    if len(sys.argv) > 1 and sys.argv[1] == "--file":
        sql = open(sys.argv[2], encoding="utf-8").read()
    elif len(sys.argv) > 1 and sys.argv[1] == "--stdin":
        sql = sys.stdin.read()
    elif len(sys.argv) > 1:
        flags = sys.argv[1:-1]
        sql = sys.argv[-1]
    else:
        sql = sys.stdin.read()
    code, out, err = run(sql, flags)
    sys.stdout.write(out)
    if err.strip():
        sys.stderr.write(err)
    return code


if __name__ == "__main__":
    sys.exit(main())
