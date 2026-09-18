#!/usr/bin/env python3
"""Validate the live retrieval SQL with real bge query vectors."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import embed_knowledge_hf as e  # noqa: E402


def embed_query(text):
    out = e.hf_embed(["Represent this sentence for searching relevant passages: " + text])
    vec = out[0][:768]
    return "[" + ",".join(str(x) for x in vec) + "]"


QUESTIONS = [
    "What are your services?",
    "Where is the company located?",
    "What is your address and telephone number?",
    "What is the cost of your roofing repair services?",
    "Can I get a quotation for your project management services?",
]

conn = e.connect()
cur = conn.cursor()
for q in QUESTIONS:
    vec = embed_query(q)
        cur.execute(
        """
        WITH q(v) AS (SELECT %s::vector)
        SELECT kc.chunk_number, kd.title AS src,
               round(1 - (kc.embedding <=> q.v), 4) AS sim,
               left(replace(kc.chunk_text, E'\n', ' | '), 75) AS chunk
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        CROSS JOIN q
        WHERE kd.status = 'indexed'
          AND kd.business_id = (SELECT id FROM businesses WHERE slug = 'garco')
          AND kc.chunk_text NOT ILIKE 'dummy content%'
          AND 1 - (kc.embedding <=> q.v) > 0.35
        ORDER BY sim DESC
        LIMIT 4;
        """,
        (vec,),
    )
    rows = cur.fetchall()
    print(f"\n=== {q!r} ===")
    for n, src, sim, chunk in rows:
        print(f"  #{n:<3} sim={sim}  [{src}]  {chunk!r}")
cur.close()
conn.close()
