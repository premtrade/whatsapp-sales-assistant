#!/usr/bin/env python3
"""TEMP: compare candidate 768-dim embedding models for retrieval quality."""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import embed_knowledge_hf as e  # noqa: E402

QUESTIONS = [
    "What are your services?",
    "Where is the company located?",
    "What is your address and telephone number?",
    "What is the cost of your roofing repair services?",
    "Can I get a quotation for your project management services?",
    "Hello",
]

MODELS = [
    "BAAI/bge-base-en-v1.5",
    "sentence-transformers/all-mpnet-base-v2",
    "intfloat/e5-base-v2",
]


def try_embed(model, texts):
    url = f"https://router.huggingface.co/hf-inference/models/{model}"
    headers = {"Content-Type": "application/json"}
    if e.HF_API_KEY:
        headers["Authorization"] = f"Bearer {e.HF_API_KEY}"
    # bge/e5 need instruction prefixes for best results
    payload = {"inputs": texts, "options": {"wait_for_model": True}}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as ex:
        return {"__error__": f"{ex.code}: {ex.read().decode()[:200]}"}


for model in MODELS:
    out = try_embed(model, ["hello world test"])
    if isinstance(out, dict) and "__error__" in out:
        print(f"{model}: FAILED {out['__error__']}")
        continue
    dims = len(out[0]) if out and isinstance(out[0], list) else out
    print(f"{model}: OK dims={dims}")