#!/usr/bin/env python3
"""
tests/setup.py - Test database setup and teardown utilities.
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_psql(sql, db="whatsapp_sales_test"):
    cmd = [
        "docker", "compose", "-f", os.path.join(REPO, "docker-compose.test.yml"),
        "exec", "-T", "postgres-test", "psql",
        "-U", "postgres", "-d", db,
        "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    return result.stdout.strip(), result.returncode, result.stderr


def setup_test_db():
    """Create test database and run migrations."""
    print("[setup] Creating test database...")
    out, code, err = run_psql("CREATE DATABASE whatsapp_sales_test;", db="postgres")
    if code != 0 and "already exists" not in (out + err):
        print(f"[setup] Warning: {err}")
    print("[setup] Test database ready")


def teardown_test_db():
    """Drop test database."""
    print("[teardown] Dropping test database...")
    run_psql("DROP DATABASE IF EXISTS whatsapp_sales_test;", db="postgres")


def migrate_test_db():
    """Run schema migrations on test database."""
    print("[setup] Running migrations...")
    schema_dir = os.path.join(REPO, "database", "schema")
    mig_dir = os.path.join(REPO, "database", "migrations")
    files = sorted(os.listdir(schema_dir)) + sorted(os.listdir(mig_dir))
    for f in files:
        if f.endswith(".sql"):
            path = os.path.join(schema_dir if f in os.listdir(schema_dir) else mig_dir, f)
            sql = open(path, encoding="utf-8").read()
            out, code, err = run_psql(sql)
            if code != 0:
                print(f"[setup] Migration {f} warning: {err}")
    print("[setup] Migrations complete")


def seed_test_db():
    """Seed test database with fixture data."""
    print("[setup] Seeding test data...")
    seed_files = [
        os.path.join(REPO, "database", "schema", "017_seed_data.sql"),
        os.path.join(REPO, "database", "migrations", "024_seed_knowledge.sql"),
        os.path.join(REPO, "database", "migrations", "027_seed_garco_document.sql"),
    ]
    for f in seed_files:
        if os.path.exists(f):
            sql = open(f, encoding="utf-8").read()
            out, code, err = run_psql(sql)
            if code != 0:
                print(f"[setup] Seed {f} warning: {err}")
    print("[setup] Seed data loaded")
