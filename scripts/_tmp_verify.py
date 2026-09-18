#!/usr/bin/env python3
"""TEMP: verify pgvector retrieval through the real DB column using bge + query prefix."""
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
    "What is your opening hours?",
]

conn = e.connect()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*), max(embedding_model) FROM knowledge_chunks WHERE embedding IS NOT NULL;")
        print("embedded chunks / model:", cur.fetchone())

    for q in QUESTIONS:
        vec = e.hf_embed([e.with_query_prefix(q)])[0]
        lit = "[" + ",".join(str(x) for x in vec) + "]"
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT kc.chunk_number, 1 - (kc.embedding <=> %s::vector) AS sim,
                       similarity(kc.chunk_text, %s) AS tri, left(kc.chunk_text, 62) AS chunk
                FROM knowledge_chunks kc
                JOIN knowledge_documents kd ON kd.id = kc.document_id
                WHERE kd.status = 'indexed'
                  AND kd.business_id = (SELECT id FROM businesses WHERE slug='garco')
                  AND 1 - (kc.embedding <=> %s::vector) > 0.35
                ORDER BY sim DESC LIMIT 4;
                """,
                (lit, q, lit),
            )
            rows = cur.fetchall()
        print(f"\n=== {q!r} -> {len(rows)} chunk(s) pass threshold 0.35 ===")
        for n, sim, tri, chunk in rows:
            print(f"  sim={sim:.4f}  #{n:<3} {chunk!r}")
finally:
    conn.close()
