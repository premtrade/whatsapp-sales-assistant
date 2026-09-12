#!/usr/bin/env python3
"""
scripts/embed_memory.py - Embed knowledge chunks into PostgreSQL/pgvector.

Reads unembedded knowledge_chunks from PostgreSQL, generates embeddings
(Hugging Face inference API when HUGGINGFACE_API_KEY is set, otherwise
deterministic pseudo-vectors for local/mock testing per .env.example), and
writes the vectors directly to knowledge_chunks.embedding (pgvector).

This replaces the old Qdrant-based embedding path. The vector store is now
PostgreSQL/pgvector (see database/migrations/032_pgvector_embeddings.sql).

Idempotent: safe to re-run - chunks already embedded with the current model
are skipped.

Usage (from repo root):
    python scripts/embed_memory.py
    HUGGINGFACE_API_KEY=... python scripts/embed_memory.py

Environment (reads .env, then OS env overrides):
    POSTGRES_HOST/PORT/DB/USER/PASSWORD
    HUGGINGFACE_API_KEY, HF_EMBED_MODEL, EMBED_DIMS
"""
import hashlib
import json
import os
import sys
import urllib.request
import urllib.error

import psycopg2

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_dotenv(path):
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


ENV = load_dotenv(os.path.join(REPO, ".env"))
ENV.update({k: v for k, v in os.environ.items() if v})

# ---------------- Config ----------------
PG_HOST = ENV.get("POSTGRES_HOST", "localhost")
PG_PORT = ENV.get("POSTGRES_PORT", "5432")
PG_USER = ENV.get("POSTGRES_USER", "postgres")
PG_DB = ENV.get("POSTGRES_DB", "whatsapp_sales")
PG_PASSWORD = ENV.get("POSTGRES_PASSWORD", "")

HF_API_KEY = ENV.get("HUGGINGFACE_API_KEY", "")
HF_MODEL = ENV.get("HF_EMBED_MODEL", "sentence-transformers/distilbert-base-nli-mean-tokens")
EMBED_DIMS = int(ENV.get("EMBED_DIMS", "768"))


# ---------------- Embeddings ----------------
def mock_embed(text):
    """Deterministic EMBED_DIMS-dim pseudo-vector from text hash (mock mode)."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    vec = []
    for i in range(EMBED_DIMS):
        b = digest[i % len(digest)] ^ ((i * 2654435761) & 0xFF)
        vec.append((b / 127.5) - 1.0)
    norm = sum(x * x for x in vec) ** 0.5
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


def hf_embed(texts):
    """Embed via Hugging Face inference API (feature-extraction pipeline)."""
    url = "https://api-inference.huggingface.co/pipeline/feature-extraction/" + HF_MODEL
    headers = {
        "Authorization": "Bearer " + HF_API_KEY,
        "Content-Type": "application/json",
    }
    body = json.dumps({"inputs": texts, "options": {"wait_for_model": True}}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
    vectors = [list(v)[:EMBED_DIMS] for v in raw]
    return vectors


def embed(texts):
    if HF_API_KEY:
        print("Using Hugging Face inference API:", HF_MODEL)
        return hf_embed(texts)
    print("MOCK MODE: no HUGGINGFACE_API_KEY -> deterministic pseudo-vectors "
          f"({EMBED_DIMS} dims). Real embeddings require HUGGINGFACE_API_KEY.")
    return [mock_embed(t) for t in texts]


def connect():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DB,
        user=PG_USER, password=PG_PASSWORD,
    )


# ---------------- Main ----------------
def fetch_chunks(conn):
    model = HF_MODEL if HF_API_KEY else "mock:" + HF_MODEL
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT kc.id, kc.chunk_text, kd.title
            FROM knowledge_chunks kc
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            WHERE kd.status = 'indexed'
              AND kc.embedding IS NULL
            ORDER BY kc.chunk_number;
            """
        )
        return cur.fetchall()


def record_embedded(conn, chunk_id, vector, text, title):
    model = "mock:" + HF_MODEL if not HF_API_KEY else HF_MODEL
    vec_literal = "[" + ",".join(str(x) for x in vector) + "]"
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE knowledge_chunks
            SET embedding = %s::vector,
                embedding_model = %s,
                updated_at = NOW()
            WHERE id = %s;
            """,
            (vec_literal, model, str(chunk_id)),
        )
        cur.execute(
            """
            INSERT INTO memory_embeddings
              (source_type, source_id, content, embedding_model, embedding_status,
               embedded_at, metadata)
            SELECT 'knowledge', %s::uuid, %s, %s, 'completed', NOW(),
                   jsonb_build_object('title', %s)
            WHERE NOT EXISTS (
                SELECT 1 FROM memory_embeddings
                WHERE source_type = 'knowledge' AND source_id = %s::uuid
                  AND embedding_model = %s
            );
            """,
            (str(chunk_id), text, model, title, str(chunk_id), model),
        )


def main():
    conn = connect()
    try:
        chunks = fetch_chunks(conn)
        if not chunks:
            print("No unembedded knowledge chunks found - nothing to do.")
            return 0

        print(f"Embedding {len(chunks)} knowledge chunk(s) into pgvector...")
        texts = [c[1] for c in chunks]
        vectors = embed(texts)

        for (chunk_id, text, title), vec in zip(chunks, vectors):
            record_embedded(conn, chunk_id, vec, text, title)
        conn.commit()
        print(f"Embedded {len(chunks)} chunk(s) into knowledge_chunks.embedding.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
