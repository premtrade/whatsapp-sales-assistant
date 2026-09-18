#!/usr/bin/env python3
"""Check that each workflow file has a top-level 'id' (needed to preserve webhook IDs)."""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WF = os.path.join(REPO, "workflows")
for name in [
    "01 - Incoming WhatsApp Message.json",
    "03 - Memory & Context Builder.json",
    "04 - Memory Writer.json",
    "Workflow 2 - AI Brain.json",
]:
    p = os.path.join(WF, name)
    wf = json.load(open(p, encoding="utf-8"))
    nid = wf.get("id", "<MISSING>")
    print(f"{name}: id={nid}")
