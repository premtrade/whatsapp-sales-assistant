#!/usr/bin/env python3
"""
TEMP patch script - fix the AI reply inconsistencies found in the WhatsApp transcript.

Applies:
  Workflow 03 - Memory & Context Builder
    * Generate Message Embedding : switch to BAAI/bge-base-en-v1.5 + bge query prefix
    * Get Knowledge Chunks (semantic) : similarity threshold 0.5 -> 0.35
    * Build Context Package : expose business_timezone
  Workflow 2 - AI Brain
    * AI Agent : systemMessage rules (time-of-day greeting, no tool-result claims,
                 never reveal internal guardrail text)
    * Parse AI Output : stop scraping CUSTOMER FACTS lines as knowledge, price before
                        services, fallback-only overrides, hallucinated-appointment guard
    * Format Context : expose business_timezone
    * Call '05 - Appointment Tool' : description warns against claiming success

Rewrites both files with canonical json.dumps(indent=2, ensure_ascii=False) since the
originals were PowerShell ConvertTo-Json output that cannot be reproduced in Python.
"""
import json

WF03 = "workflows/03 - Memory & Context Builder.json"
WF2 = "workflows/Workflow 2 - AI Brain.json"

BGE_MODEL = "BAAI/bge-base-en-v1.5"
BGE_URL = f"https://router.huggingface.co/hf-inference/models/{BGE_MODEL}"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

NEW_JSON_BODY = (
    '={\n'
    '  "inputs": [{{ JSON.stringify("' + QUERY_PREFIX + '" + '
    "$('When Executed by Another Workflow').item.json.message) }}],\n"
    '  "options": {"wait_for_model": true}\n'
    '}'
)


def get_node(wf, name):
    for n in wf["nodes"]:
        if n["name"] == name:
            return n
    raise KeyError(f"node not found: {name} (have: {[x['name'] for x in wf['nodes']]})")


def replace_once(text, old, new, label):
    if old not in text:
        raise ValueError(f"pattern not found for {label}: {old[:80]!r}")
    return text.replace(old, new, 1)


# ----------------------------------------------------------------------------
# Workflow 03
# ----------------------------------------------------------------------------
wf03 = json.load(open(WF03, encoding="utf-8"))

emb = get_node(wf03, "Generate Message Embedding")
emb["parameters"]["url"] = BGE_URL
emb["parameters"]["jsonBody"] = NEW_JSON_BODY

sem = get_node(wf03, "Get Knowledge Chunks (semantic)")
sem["parameters"]["query"] = replace_once(
    sem["parameters"]["query"],
    "AND 1 - (kc.embedding <=> $1::vector) > 0.5",
    "AND 1 - (kc.embedding <=> $1::vector) > 0.35",
    "similarity threshold",
)

bcp = get_node(wf03, "Build Context Package")
bcp["parameters"]["jsCode"] = replace_once(
    bcp["parameters"]["jsCode"],
    "business_name: business.name || settings.setting_value || 'our company', "
    "business_id: business.id || null,",
    "business_name: business.name || settings.setting_value || 'our company', "
    "business_id: business.id || null, "
    "business_timezone: business.timezone || 'America/Jamaica',",
    "business_timezone",
)

open(WF03, "w", encoding="utf-8", newline="\n").write(
    json.dumps(wf03, indent=2, ensure_ascii=False) + "\n"
)
print("patched", WF03)

# ----------------------------------------------------------------------------
# Workflow 2 - AI Brain
# ----------------------------------------------------------------------------
wf2 = json.load(open(WF2, encoding="utf-8"))

fc = get_node(wf2, "Format Context")
fc["parameters"]["jsCode"] = replace_once(
    fc["parameters"]["jsCode"],
    "business_name: businessName, conversationHistory: history,",
    "business_name: businessName, "
    "business_timezone: ctx.business_timezone || 'America/Jamaica', "
    "conversationHistory: history,",
    "Format Context business_timezone",
)

tool = get_node(wf2, "Call '05 - Appointment Tool'")
tool["parameters"]["description"] = (
    "Schedule a site visit or consultation. Use when the customer requests an appointment, "
    "site visit, meeting, or a time to be booked. Pass appointment_type, title, location, "
    "preferred_date (YYYY-MM-DD), preferred_time (HH:MM 24h), duration_minutes. "
    "Call this tool BEFORE telling the customer anything is scheduled, and only confirm the "
    "appointment when the tool result reports success. If a required detail such as the "
    "project location, date, or time is missing, ask the customer for it first."
)

open(WF2, "w", encoding="utf-8", newline="\n").write(
    json.dumps(wf2, indent=2, ensure_ascii=False) + "\n"
)
print("patched", WF2)