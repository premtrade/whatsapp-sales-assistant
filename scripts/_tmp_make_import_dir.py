#!/usr/bin/env python3
"""Write the 4 patched workflow files into a single import dir (clean names, ids intact)."""
import json
import os
import shutil

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "workflows")
DST = os.path.join(REPO, "scripts", "_import_dir")
shutil.rmtree(DST, ignore_errors=True)
os.makedirs(DST, exist_ok=True)
for name in [
    "01 - Incoming WhatsApp Message.json",
    "03 - Memory & Context Builder.json",
    "04 - Memory Writer.json",
    "Workflow 2 - AI Brain.json",
]:
    src = os.path.join(SRC, name)
    dst_name = name.replace(" - ", "_").replace(" ", "_")
    dst = os.path.join(DST, dst_name)
    wf = json.load(open(src, encoding="utf-8"))
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("wrote", dst, "id=", wf.get("id"))
