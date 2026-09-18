#!/usr/bin/env python3
"""Copy the 4 patched workflows (original names) into scripts/_import_dir2 for n8n --separate import."""
import os
import shutil

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(REPO, "scripts", "_import_dir2")
shutil.rmtree(DST, ignore_errors=True)
os.makedirs(DST, exist_ok=True)
for name in [
    "01 - Incoming WhatsApp Message.json",
    "03 - Memory & Context Builder.json",
    "04 - Memory Writer.json",
    "Workflow 2 - AI Brain.json",
]:
    shutil.copy(os.path.join(REPO, "workflows", name),
                os.path.join(DST, name))
    print("copied", name)
print("dir:", DST)
