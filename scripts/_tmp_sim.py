#!/usr/bin/env python3
"""TEMP: measure real semantic/trigram similarity for the observed questions."""
import os
import sys

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

conn = e.connect()
try:
    for q in QUESTIONS:
        vec = e.hf_embed([q])[0]
        vec = vec[:768] if len(vec) >= 768 else vec + [0.0] * (768 - len(vec))
        lit = "[" + ",".join(str(x) for x in vec) + "]"
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT kc.chunk_number,
                       1 - (kc.embedding <=> %s::vector) AS sim,
                       similarity(kc.chunk_text, %s) AS tri,
                       left(kc.chunk_text, 60) AS chunk
                FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kd.id = kc.document_id
                WHERE kd.status = 'indexed'
                  AND kd.business_id = (SELECT id FROM businesses WHERE slug='garco')
                ORDER BY sim DESC
                LIMIT 5;
                """,
                (lit, q),
            )
            rows = cur.fetchall()
        print(f"\n=== {q!r} ===")
        for n, sim, tri, chunk in rows:
            print(f"  #{n:<3} sim={sim:.4f} tri={tri:.4f}  {chunk!r}")
finally:
    conn.close()
