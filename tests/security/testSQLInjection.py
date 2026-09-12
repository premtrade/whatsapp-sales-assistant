#!/usr/bin/env python3
"""
tests/security/testSQLInjection.py - Verify all SQL queries use parameterized queries.
"""
import os
import re

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


WORKFLOW_FILES = [
    os.path.join(REPO, "workflows", "01 - Incoming WhatsApp Message.json"),
    os.path.join(REPO, "workflows", "03 - Memory & Context Builder.json"),
    os.path.join(REPO, "workflows", "04 - Memory Writer.json"),
    os.path.join(REPO, "workflows", "Workflow 2 - AI Brain.json"),
    os.path.join(REPO, "workflows", "05 - Appointment Tool.json"),
    os.path.join(REPO, "workflows", "Workflow 6 — Quote Tool.json"),
    os.path.join(REPO, "workflows", "Workflow 7 - Handoff Tool.json"),
]


def extract_queries_from_workflow(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = __import__("json").load(f)
    queries = []
    for node in data.get("nodes", []):
        if node.get("type") == "n8n-nodes-base.postgres":
            query = node.get("parameters", {}).get("query", "")
            if query:
                queries.append((node.get("name", "unknown"), query))
    return queries


class TestSQLInjection:
    @pytest.mark.parametrize("filepath", WORKFLOW_FILES, ids=lambda f: os.path.basename(f))
    def test_all_postgres_queries_use_parameters(self, filepath):
        queries = extract_queries_from_workflow(filepath)
        assert len(queries) > 0, f"No postgres queries found in {filepath}"
        for node_name, query in queries:
            if "SELECT" in query.upper() or "INSERT" in query.upper() or "UPDATE" in query.upper() or "DELETE" in query.upper():
                has_params = bool(re.search(r"\$\d+", query))
                assert has_params, f"Query in node '{node_name}' in {filepath} does not use parameterized queries ($1, $2, etc.)"

    def test_no_raw_string_interpolation_in_queries(self):
        dangerous_patterns = [
            r"'\s*\+",
            r"\+\s*'",
            r"format\s*\(",
            r"f['\"].*\{.*\}.*['\"]",
        ]
        for filepath in WORKFLOW_FILES:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            for pattern in dangerous_patterns:
                matches = re.findall(pattern, content)
                assert len(matches) == 0, f"Dangerous string interpolation found in {filepath}: {matches}"

    def test_like_clauses_use_parameterized_wildcards(self):
        for filepath in WORKFLOW_FILES:
            queries = extract_queries_from_workflow(filepath)
            for node_name, query in queries:
                if "LIKE" in query.upper() and "%" in query:
                    has_safe_pattern = "LOWER(" in query and "||" in query and "$" in query
                    assert has_safe_pattern, f"LIKE clause in '{node_name}' should use parameterized wildcards"

    def test_insert_statements_use_dollar_parameters(self):
        for filepath in WORKFLOW_FILES:
            queries = extract_queries_from_workflow(filepath)
            for node_name, query in queries:
                if query.strip().upper().startswith("INSERT"):
                    dollar_params = re.findall(r"\$\d+", query)
                    assert len(dollar_params) >= 1, f"INSERT in '{node_name}' should use $1, $2, etc."

    def test_upsert_uses_on_conflict(self):
        for filepath in WORKFLOW_FILES:
            queries = extract_queries_from_workflow(filepath)
            for node_name, query in queries:
                if "ON CONFLICT" in query.upper():
                    assert "DO UPDATE" in query.upper() or "DO NOTHING" in query.upper(), f"ON CONFLICT in '{node_name}' should have DO clause"

    def test_no_sql_comment_injection(self):
        for filepath in WORKFLOW_FILES:
            queries = extract_queries_from_workflow(filepath)
            for node_name, query in queries:
                assert "--" not in query or "--" in query.split("$")[0], f"Potential SQL comment injection in '{node_name}'"
