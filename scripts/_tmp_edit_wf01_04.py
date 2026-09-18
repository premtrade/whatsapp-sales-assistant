#!/usr/bin/env python3
"""Patch Workflow 01: drop status@broadcast + empty-body events; patch Workflow 04: drop null facts."""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FACTS_NORMALIZE = r"""const result = $('Extract Customer Facts').first()?.json || {};
const facts = result.output?.facts || result.facts || [];
const contactId = $('When Executed by Another Workflow').first().json.contact_id;

const normalizedFacts = (Array.isArray(facts) ? facts : [])
  .filter(f => f && f.fact_key != null && f.fact_value != null)
  .map(f => ({
    contact_id: contactId,
    fact_key: String(f.fact_key).trim(),
    fact_value: String(f.fact_value).trim(),
    confidence: Number(f.confidence || 0.9),
    source: 'ai'
  }))
  .filter(f => f.fact_key && f.fact_value && !['null', 'undefined', ''].includes(f.fact_key.toLowerCase()));

return [{ json: { facts: normalizedFacts, count: normalizedFacts.length } }];"""


def find_node(wf, name):
    for n in wf.get("nodes", []):
        if n.get("name") == name:
            return n
    raise SystemExit(f"node not found: {name}")


def main():
    p01 = os.path.join(REPO, "workflows", "01 - Incoming WhatsApp Message.json")
    wf = json.load(open(p01, encoding="utf-8"))
    sf = find_node(wf, "Status Filter")
    sf["parameters"]["conditions"]["conditions"] = [
        {
            "id": "is-real-message",
            "leftValue": "={{ Boolean($json.message) && !String($json.chat_id || '').startsWith('status@broadcast') }}",
            "rightValue": "true",
            "operator": {"type": "string", "operation": "equals", "singleValue": True},
        }
    ]
    with open(p01, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("patched", p01)

    p04 = os.path.join(REPO, "workflows", "04 - Memory Writer.json")
    wf4 = json.load(open(p04, encoding="utf-8"))
    p = find_node(wf4, "Prepare Customer Facts")
    p["parameters"]["jsCode"] = FACTS_NORMALIZE
    with open(p04, "w", encoding="utf-8") as f:
        json.dump(wf4, f, indent=2, ensure_ascii=False)
    print("patched", p04)


if __name__ == "__main__":
    main()
