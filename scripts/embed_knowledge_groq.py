#!/usr/bin/env python3
"""
scripts/embed_knowledge_groq.py - Embed knowledge chunks into PostgreSQL/pgvector using Groq API.

Reads unembedded knowledge_chunks from PostgreSQL, generates embeddings
using Groq's text-embedding-3-small model, and writes the vectors 
directly to knowledge_chunks.embedding (pgvector).

Idempotent: safe to re-run - chunks already embedded are skipped.

Usage (from repo root):
    python scripts/embed_knowledge_groq.py

Environment (reads .env, then OS env overrides):
    POSTGRES_HOST/PORT/DB/USER/PASSWORD
    GROQ_API_KEY
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

GROQ_API_KEY = ENV.get("GROQ_API_KEY", "")
GROQ_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536  # text-embedding-3-small outputs 1536 dimensions


def groq_embed(texts):
    """Embed texts via Groq API."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is required")

    url = "https://api.groq.com/openai/v1/embeddings"
    headers = {
        "Authorization": "Bearer " + GROQ_API_KEY,
        "Content-Type": "application/json",
    }
    body = json.dumps({
        "model": GROQ_MODEL,
        "input": texts
    }).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
            embeddings = [item["embedding"] for item in raw["data"]]
            return embeddings
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise Exception(f"Groq API error {e.code}: {error_body}")


def connect():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_DB,
        user=PG_USER, password=PG_PASSWORD,
    )


def fetch_chunks(conn):
    """Fetch chunks that need embedding."""
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


def fetch_embedded_count(conn):
    """Count total embedded chunks."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM knowledge_chunks WHERE embedding IS NOT NULL;")
        return cur.fetchone()[0]


def fetch_total_count(conn):
    """Count total indexed chunks."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM knowledge_chunks kc
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            WHERE kd.status = 'indexed';
        """)
        return cur.fetchone()[0]


def record_embedded(conn, chunk_id, vector, text, title):
    """Update chunk with embedding and record in memory_embeddings."""
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
            (vec_literal, GROQ_MODEL, str(chunk_id)),
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
            (str(chunk_id), text, GROQ_MODEL, title, str(chunk_id), GROQ_MODEL),
        )


def main():
    if not GROQ_API_KEY:
        print("Error: GROQ_API_KEY environment variable is required")
        print("Set it in .env or export GROQ_API_KEY=your_key")
        return 1

    print(f"Using Groq model: {GROQ_MODEL} ({EMBED_DIMS} dimensions)")

    conn = connect()
    try:
        total = fetch_total_count(conn)
        embedded = fetch_embedded_count(conn)
        print(f"Status: {embedded}/{total} chunks already embedded")

        chunks = fetch_chunks(conn)
        if not chunks:
            print("No unembedded knowledge chunks found - nothing to do.")
            return 0

        print(f"Embedding {len(chunks)} knowledge chunk(s) into pgvector...")

        # Batch size for API calls
        batch_size = 100
        total_batches = (len(chunks) + batch_size - 1) // batch_size

        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(chunks))
            batch = chunks[start_idx:end_idx]

            texts = [c[1] for c in batch]
            print(f"  Processing batch {batch_num + 1}/{total_batches} ({len(texts)} chunks)...")

            try:
                vectors = groq_embed(texts)

                for (chunk_id, text, title), vec in zip(batch, vectors):
                    record_embedded(conn, chunk_id, vec, text, title)
                conn.commit()
                print(f"    Batch {batch_num + 1} complete")
            except Exception as e:
                print(f"    Error in batch {batch_num + 1}: {e}")
                conn.rollback()
                raise

        final_embedded = fetch_embedded_count(conn)
        print(f"\nEmbedded {len(chunks)} chunk(s). Total embedded: {final_embedded}/{total}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
