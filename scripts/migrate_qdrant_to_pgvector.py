#!/usr/bin/env python3
"""
Qdrant to pgvector Migration Script

Scrolls all points from Qdrant collection 'whatsapp_sales_v2' and upserts
vectors into PostgreSQL knowledge_chunks table matching by qdrant_point_id.

Usage:
    python scripts/migrate_qdrant_to_pgvector.py [--batch-size N] [--dry-run]
"""

import os
import sys
import argparse
import psycopg2
from psycopg2.extras import execute_batch
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct
from dotenv import load_dotenv

load_dotenv()

# Configuration
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "whatsapp_sales_v2")

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "whatsapp_sales")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")

BATCH_SIZE = 100


def get_qdrant_client() -> QdrantClient:
    """Create Qdrant client."""
    return QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


def get_pg_connection():
    """Create PostgreSQL connection."""
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )


def scroll_qdrant_points(client: QdrantClient, collection: str, limit: int = 100):
    """Scroll all points from Qdrant collection."""
    offset = None
    total_scrolled = 0

    while True:
        points, next_offset = client.scroll(
            collection_name=collection,
            limit=limit,
            offset=offset,
            with_vectors=True,
            with_payload=True,
        )

        if not points:
            break

        yield points
        total_scrolled += len(points)
        offset = next_offset

        if offset is None:
            break

    print(f"Total points scrolled from Qdrant: {total_scrolled}")


def upsert_embeddings_batch(conn, points_batch):
    """Batch upsert embeddings into knowledge_chunks."""
    cursor = conn.cursor()

    # Prepare upsert data: (qdrant_point_id, embedding_vector, embedding_model)
    upsert_data = []
    for point in points_batch:
        vector = point.vector
        if isinstance(vector, dict):
            vector = list(vector.values())[0]
        if vector is None:
            print(f"Warning: Point {point.id} has no vector, skipping")
            continue

        vector_str = "[" + ",".join(map(str, vector)) + "]"
        upsert_data.append((vector_str, "sentence-transformers/distilbert-base-nli-mean-tokens", str(point.id)))

    if not upsert_data:
        return 0

    # Batch upsert using ON CONFLICT
    query = """
        UPDATE knowledge_chunks
        SET
            embedding = %s::vector,
            embedding_model = %s,
            updated_at = NOW()
        WHERE qdrant_point_id = %s::uuid
    """

    try:
        execute_batch(cursor, query, upsert_data, page_size=len(upsert_data))
        conn.commit()
        updated = cursor.rowcount
        cursor.close()
        return updated
    except Exception as e:
        conn.rollback()
        cursor.close()
        raise e


def verify_migration(conn):
    """Verify migration results."""
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            COUNT(*) AS total_chunks,
            COUNT(embedding) AS embedded_chunks,
            COUNT(qdrant_point_id) AS with_qdrant_id,
            COUNT(*) FILTER (WHERE embedding IS NOT NULL AND qdrant_point_id IS NOT NULL) AS both_present
        FROM knowledge_chunks
    """)

    total, embedded, with_qdrant, both = cursor.fetchone()

    cursor.execute("""
        SELECT COUNT(*) FROM knowledge_chunks
        WHERE qdrant_point_id IS NOT NULL AND embedding IS NULL
    """)
    missing_embeddings = cursor.fetchone()[0]

    cursor.close()

    print("\n=== Migration Verification ===")
    print(f"Total knowledge_chunks:           {total}")
    print(f"Chunks with embeddings:           {embedded}")
    print(f"Chunks with qdrant_point_id:      {with_qdrant}")
    print(f"Chunks with both:                 {both}")
    print(f"Chunks with qdrant_id but NO embedding: {missing_embeddings}")

    if missing_embeddings > 0:
        print(f"\nWARNING: {missing_embeddings} chunks have qdrant_point_id but no embedding!")
        return False

    if embedded == with_qdrant and with_qdrant > 0:
        print("\nSUCCESS: All Qdrant-linked chunks have embeddings!")
        return True

    print("\nWARNING: Counts don't match expected pattern")
    return False


def main():
    parser = argparse.ArgumentParser(description="Migrate Qdrant vectors to pgvector")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Batch size for Qdrant scroll and PG upsert")
    parser.add_argument("--dry-run", action="store_true", help="Only scroll and report, don't write to PostgreSQL")
    args = parser.parse_args()

    print("=" * 60)
    print("Qdrant -> pgvector Migration")
    print("=" * 60)
    print(f"Qdrant: {QDRANT_HOST}:{QDRANT_PORT} / {QDRANT_COLLECTION}")
    print(f"PostgreSQL: {POSTGRES_HOST}:{POSTGRES_PORT} / {POSTGRES_DB}")
    print(f"Batch size: {args.batch_size}")
    print(f"Dry run: {args.dry_run}")
    print("=" * 60)

    # Connect to Qdrant
    try:
        qdrant = get_qdrant_client()
        info = qdrant.get_collection(QDRANT_COLLECTION)
        # Handle different API versions
        vectors_count = getattr(info, 'vectors_count', None) or getattr(info, 'points_count', None) or getattr(info, 'config', {}).get('params', {}).get('vectors', {}).get('count', 'unknown')
        print(f"Qdrant collection '{QDRANT_COLLECTION}' exists: {vectors_count} vectors")
    except Exception as e:
        print(f"ERROR connecting to Qdrant: {e}")
        sys.exit(1)

    # Connect to PostgreSQL
    if not args.dry_run:
        try:
            pg = get_pg_connection()
            print("PostgreSQL connection established")
        except Exception as e:
            print(f"ERROR connecting to PostgreSQL: {e}")
            sys.exit(1)
    else:
        pg = None

    # Migration loop
    total_processed = 0
    total_updated = 0

    for batch in scroll_qdrant_points(qdrant, QDRANT_COLLECTION, limit=args.batch_size):
        print(f"Processing batch of {len(batch)} points...")
        total_processed += len(batch)

        if not args.dry_run:
            updated = upsert_embeddings_batch(pg, batch)
            total_updated += updated
            print(f"  Updated {updated} rows in PostgreSQL")

    print(f"\nTotal points processed: {total_processed}")

    if not args.dry_run and pg:
        success = verify_migration(pg)
        pg.close()
        sys.exit(0 if success else 1)

    print("\nDry run complete. No changes made.")


if __name__ == "__main__":
    main()