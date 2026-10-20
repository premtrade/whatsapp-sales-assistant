#!/usr/bin/env python3
"""
patch_workflows_ai_prompt.py - inject the tenant-safe AI prompt pipeline into the
n8n workflow exports.

Why this exists
---------------
n8n does NOT resolve {{ }} expressions inside the AI Agent node's
`options.systemMessage`; it forwards the raw template string to the model.
The model therefore never saw the tenant's business name (it invented one:
"You're speaking with Acme Corp") and never saw the retrieved knowledge
("I don't have the details on our services").

The fix moves every dynamic value into the agent's `text` parameter (a
top-level parameter, which n8n DOES resolve) and keeps only static rules in
the system message. `Format Context` now also emits `finalPrompt`,
`business_name` and `business_name_known`.

Files touched
-------------
  workflows/Workflow 2 - AI Brain.json
  workflows/live/Workflow 2 - AI Brain.json
  workflows/03 - Memory & Context Builder.json
  workflows/live/03 - Memory & Context Builder.json

Usage:
    python3 scripts/patch_workflows_ai_prompt.py            # patch repo copies
    python3 scripts/patch_workflows_ai_prompt.py --check    # verify only
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODE_DIR = os.path.join(ROOT, "workflows", "code")

AI_BRAIN = "Workflow 2 - AI Brain.json"
CONTEXT_BUILDER = "03 - Memory & Context Builder.json"
WORKFLOW_DIRS = [
    os.path.join(ROOT, "workflows"),
    os.path.join(ROOT, "workflows", "live"),
]

AGENT_TEXT_EXPR = "={{ $('Format Context').first().json.finalPrompt }}"

OLD_IDENTITY = "business_name: business.name || business.slug || settings.setting_value || 'ROLINJ.IO'"
NEW_IDENTITY = (
    "business_name: business.name || business.slug || settings.setting_value || '', "
    "business_slug: business.slug || '', "
    "business_name_known: Boolean(business.name || business.slug || settings.setting_value)"
)


def read_code(name: str) -> str:
    with open(os.path.join(CODE_DIR, name), "r", encoding="utf-8") as fh:
        return fh.read()


def find_node(wf: dict, name: str):
    for node in wf.get("nodes", []):
        if node.get("name") == name:
            return node
    raise KeyError(f"node {name!r} not found")


def patch_ai_brain(wf: dict, format_context: str, parse_output: str, system_message: str) -> list:
    changed = []

    fmt = find_node(wf, "Format Context")
    if fmt.get("parameters", {}).get("jsCode") != format_context:
        fmt["parameters"]["jsCode"] = format_context
        changed.append("Format Context.jsCode")

    agent = find_node(wf, "AI Agent")
    params = agent.setdefault("parameters", {})
    if params.get("text") != AGENT_TEXT_EXPR:
        params["text"] = AGENT_TEXT_EXPR
        changed.append("AI Agent.text")
    options = params.setdefault("options", {})
    if options.get("systemMessage") != system_message:
        options["systemMessage"] = system_message
        changed.append("AI Agent.options.systemMessage")

    parse = find_node(wf, "Parse AI Output")
    if parse.get("parameters", {}).get("jsCode") != parse_output:
        parse["parameters"]["jsCode"] = parse_output
        changed.append("Parse AI Output.jsCode")

    return changed


def patch_context_builder(wf: dict) -> list:
    changed = []
    builder = find_node(wf, "Build Context Package")
    code = builder.get("parameters", {}).get("jsCode", "")
    if OLD_IDENTITY in code:
        builder["parameters"]["jsCode"] = code.replace(OLD_IDENTITY, NEW_IDENTITY)
        changed.append("Build Context Package.identity")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report differences without writing")
    args = parser.parse_args()

    format_context = read_code("format_context.js")
    parse_output = read_code("parse_ai_output.js")
    system_message = read_code("ai_agent_system_message.txt").rstrip("\n")

    total = 0
    for wdir in WORKFLOW_DIRS:
        for fname in (AI_BRAIN, CONTEXT_BUILDER):
            path = os.path.join(wdir, fname)
            if not os.path.exists(path):
                continue
            with open(path, "r", encoding="utf-8-sig") as fh:
                wf = json.load(fh)
            if fname == AI_BRAIN:
                changed = patch_ai_brain(wf, format_context, parse_output, system_message)
            else:
                changed = patch_context_builder(wf)
            if not changed:
                print(f"ok    {os.path.relpath(path, ROOT)} (already patched)")
                continue
            total += len(changed)
            print(f"{'would patch' if args.check else 'patched'} {os.path.relpath(path, ROOT)}: {', '.join(changed)}")
            if not args.check:
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(wf, fh, indent=2, ensure_ascii=False)
                    fh.write("\n")
    if args.check and total:
        print(f"\n{total} change(s) pending")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
