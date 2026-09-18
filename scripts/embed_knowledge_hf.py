#!/usr/bin/env python3
"""
scripts/embed_knowledge_hf.py - Embed knowledge chunks using Hugging Face Inference API.

Uses the Hugging Face Inference API with BAAI/bge-base-en-v1.5
(768 dimensions - matches the knowledge_chunks.embedding vector(768) column and the
model configured in n8n Workflow 03 "Generate Message Embedding").

Model choice matters: bge-base-en-v1.5 retrieves Garco knowledge far better than the
previous distilbert-base-nli-mean-tokens. Distilbert scored the question
"What are your services?" at only 0.39 cosine similarity (below Workflow 03's
similarity threshold, so the AI answered "I don't have that information"), while
bge-base-en-v1.5 scores the correct services chunks at 0.54-0.56.

bge retrieval convention (must match Workflow 03 exactly):
    - passages/chunks are embedded WITHOUT any prefix
    - search queries are embedded WITH QUERY_PREFIX

Idempotent: safe to re-run - chunks are re-embedded with the current model.

Usage (from repo root):
    python scripts/embed_knowledge_hf.py

Environment (reads .env, then OS env overrides):
    POSTGRES_HOST/PORT/DB/USER/PASSWORD
    HUGGINGFACE_API_KEY (or HF_API_KEY)
    HF_EMBED_MODEL (default: BAAI/bge-base-en-v1.5)
"""
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

HF_API_KEY = ENV.get("HUGGINGFACE_API_KEY") or ENV.get("HF_API_KEY", "")
HF_MODEL = ENV.get("HF_EMBED_MODEL", "BAAI/bge-base-en-v1.5")
EMBED_DIMS = 768  # bge-base-en-v1.5 outputs 768 dimensions

# bge-base-en-v1.5 recommends this instruction prefix on *queries* only.
# Workflow 03 "Generate Message Embedding" must send the same prefix so that
# query vectors live in the same space as the passage vectors written here.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


def with_query_prefix(text):
    """Add the bge query instruction prefix (for search queries, not passages)."""
    return QUERY_PREFIX + str(text)


def hf_embed(texts):
    """Embed texts via Hugging Face Inference API (router endpoint)."""
    url = f"https://router.huggingface.co/hf-inference/models/{HF_MODEL}"

    headers = {
        "Content-Type": "application/json",
    }
    if HF_API_KEY:
        headers["Authorization"] = f"Bearer {HF_API_KEY}"

    body = json.dumps({"inputs": texts, "options": {"wait_for_model": True}}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
            return raw
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise Exception(f"HuggingFace API error {e.code}: {error_body}")


def connect():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DB,
        user=PG_USER, password=PG_PASSWORD,
    )


def fetch_all_chunks(conn):
    """Fetch all chunks that need embedding (or all if force=True)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT kc.id, kc.chunk_text, kd.title
            FROM knowledge_chunks kc
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            WHERE kd.status = 'indexed'
            ORDER BY kc.chunk_number;
            """
        )
        return cur.fetchall()


def fetch_stats(conn):
    """Get embedding stats."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                COUNT(*) as total,
                COUNT(embedding) as embedded,
                MAX(embedding_model) as current_model
            FROM knowledge_chunks;
        """)
        return cur.fetchone()


def record_embedded(conn, chunk_id, vector, text, title):
    """Update chunk with embedding."""
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
            (vec_literal, HF_MODEL, str(chunk_id)),
        )
        # Also record in memory_embeddings (no unique constraint on
        # (source_type, source_id), so guard with WHERE NOT EXISTS)
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
            );
            """,
            (str(chunk_id), text, HF_MODEL, title, str(chunk_id)),
        )


def main():
    print(f"Using HuggingFace model: {HF_MODEL} ({EMBED_DIMS} dimensions)")

    conn = connect()
    try:
        stats = fetch_stats(conn)
        total, embedded, current_model = stats
        print(f"Status before: {embedded}/{total} chunks embedded")
        print(f"Current model: {current_model}")

        chunks = fetch_all_chunks(conn)
        if not chunks:
            print("No chunks found to embed.")
            return 0

        print(f"\nEmbedding {len(chunks)} chunk(s)...")

        # Batch size for API calls
        batch_size = 10  # Smaller batches for HF API
        total_batches = (len(chunks) + batch_size - 1) // batch_size

        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(chunks))
            batch = chunks[start_idx:end_idx]

            texts = [c[1] for c in batch]
            print(f"  Batch {batch_num + 1}/{total_batches} ({len(texts)} chunks)...")

            try:
                vectors = hf_embed(texts)

                for (chunk_id, text, title), vec in zip(batch, vectors):
                    # Ensure correct dimensionality
                    vec = vec[:EMBED_DIMS] if len(vec) >= EMBED_DIMS else vec + [0.0] * (EMBED_DIMS - len(vec))
                    record_embedded(conn, chunk_id, vec, text, title)
                conn.commit()
                print(f"    Batch {batch_num + 1} complete")
            except Exception as e:
                print(f"    Error in batch {batch_num + 1}: {e}")
                if "rate limit" in str(e).lower() or "429" in str(e):
                    print("    Rate limited. Waiting 60 seconds...")
                    import time
                    time.sleep(60)
                    continue
                conn.rollback()
                raise

        final_stats = fetch_stats(conn)
        print(f"\nDone! {final_stats[1]}/{final_stats[0]} chunks embedded")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
