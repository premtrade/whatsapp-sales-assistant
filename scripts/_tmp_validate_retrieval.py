#!/usr/bin/env python3
"""Validate the EXACT live retrieval SQL (threshold 0.35, dummy excluded) with real bge query vectors."""
import os
import psycopg2

import embed_knowledge_hf as e


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
SQL = """
SELECT kc.chunk_number, kd.title AS source, round(1 - (kc.embedding <=> %s::vector), 4) AS sim,
       left(replace(kc.chunk_text, E'\n', ' | '), 80) AS chunk
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
WHERE kd.status = 'indexed'
  AND kd.business_id = (SELECT id FROM businesses WHERE slug = 'garco')
  AND kc.chunk_text NOT ILIKE 'dummy content%'
  AND 1 - (kc.embedding <=> $1::vector) > 0.35
ORDER BY sim DESC
LIMIT 4;
"""
# psycopg2 params
cur = conn.cursor()
for q in QUESTIONS:
    vec = embed_query(q)
    cur.execute(
        """
        SELECT kc.chunk_number, kd.title AS src,
               round(1 - (kc.embedding <=> %s::vector), 4) AS sim,
               left(replace(kc.chunk_text, E'\n', ' | '), 75) AS chunk
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
                        WHERE kd.status = 'indexed'
          AND kd.business_id = (SELECT id FROM businesses WHERE slug = 'garco')
          AND kc.chunk_text NOT ILIKE 'dummy content%'
          AND 1 - (kc.embedding <=> %s::vector) > 0.35
        ORDER BY sim DESC
        LIMIT 4;
        """,
        (vec, vec),
    )
    rows = cur.fetchall()
    print(f"\n=== {q!r} ===")
    for n, src, sim, chunk in rows:
        print(f"  #{n:<3} sim={sim}  [{src}]  {chunk!r}")
cur.close()
conn.close()
