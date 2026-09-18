#!/usr/bin/env python3
"""TEMP: rank chunks for each question using bge-base-en-v1.5 (in-memory, no DB writes)."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import embed_knowledge_hf as e  # noqa: E402

e.HF_MODEL = "BAAI/bge-base-en-v1.5"

QUESTIONS = [
    "What are your services?",
    "Where is the company located?",
    "What is your address and telephone number?",
    "What is the cost of your roofing repair services?",
    "Can I get a quotation for your project management services?",
]

conn = e.connect()
with conn.cursor() as cur:
    cur.execute(
        """
        SELECT kc.chunk_number, kc.chunk_text
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        WHERE kd.status='indexed'
          AND kd.business_id = (SELECT id FROM businesses WHERE slug='garco')
          AND kc.chunk_number > 0
        ORDER BY kc.chunk_number;
        """
    )
    chunks = cur.fetchall()
conn.close()


def cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


doc_vecs = e.hf_embed([c[1] for c in chunks])
prefix = "Represent this sentence for searching relevant passages: "
q_vecs = e.hf_embed([prefix + q for q in QUESTIONS])

for q, qv in zip(QUESTIONS, q_vecs):
    scored = sorted(((cos(qv, dv), n, t) for dv, (n, t) in zip(doc_vecs, chunks)), reverse=True)
    print(f"\n=== {q!r} ===")
    for s, n, t in scored[:4]:
        print(f"  sim={s:.4f}  #{n:<3} {t[:65]!r}")