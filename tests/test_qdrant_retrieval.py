"""
tests/test_qdrant_retrieval.py

Validation for Phase 3 (Knowledge Base): exercises the Qdrant semantic-retrieval
path used by the memory builder. Builds a query vector (mock mode unless a
HUGGINGFACE_API_KEY is present) and searches the collection, printing the top
nearest knowledge chunks.

NOTE: In mock mode (no HF key) the vectors are deterministic hashes, so scores
prove the pipeline round-trips (store + retrieve) but are NOT semantically
meaningful. Enable HUGGINGFACE_API_KEY for real semantic retrieval.
"""
import json
import os
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "scripts"))

import embed_memory as em  # noqa: E402


def search(vector, limit=5):
    vectors_config = em.qdrant_collection_config()
    use_named_vectors = "size" not in vectors_config
    vector_name = list(vectors_config.keys())[0] if use_named_vectors else None

    body_data = {"query": vector, "limit": limit, "with_payload": True}
    if use_named_vectors:
        body_data["using"] = vector_name

    url = (f"http://{em.QDRANT_HOST}:{em.QDRANT_PORT}/collections/"
           f"{em.QDRANT_COLLECTION}/points/query")
    body = json.dumps(body_data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=em.qdrant_headers(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    from embed_memory import embed  # uses API or mock
    queries = [
        "what services does Garco offer?",
        "do you offer financing?",
        "where is Garco located?",
    ]
    for q in queries:
        vec = embed([q])[0]
        result = search(vec)
        print("=" * 70)
        print("QUERY:", q)
        for hit in result.get("result", {}).get("points", []):
            p = hit.get("payload", {})
            print(f"  score={hit.get('score', 0):.4f} | {p.get('title','')} | "
                  f"{p.get('chunk_text','')[:70]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
