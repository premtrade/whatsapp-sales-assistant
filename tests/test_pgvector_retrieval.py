"""
tests/test_pgvector_retrieval.py

Validation for pgvector semantic-retrieval path.
Builds a query vector using Hugging Face embeddings and searches
the knowledge_chunks table using pgvector cosine similarity.
"""
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "scripts"))

from embed_memory import embed  # uses API or mock


def get_pg_connection():
    """Create PostgreSQL connection."""
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "whatsapp_sales"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )


def search_pgvector(vector, limit=5):
    """Search knowledge_chunks using pgvector cosine similarity."""
    conn = get_pg_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        # Convert vector to pgvector format string
        vector_str = "[" + ",".join(map(str, vector)) + "]"
        cursor.execute("""
            SELECT chunk_text, metadata, 1 - (embedding <=> %s::vector) AS similarity
            FROM knowledge_chunks
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT %s;
        """, (vector_str, vector_str, limit))
        return cursor.fetchall()
    finally:
        conn.close()


def main():
    queries = [
        "what services does Garco offer?",
        "do you offer financing?",
        "where is Garco located?",
    ]
    for q in queries:
        vec = embed([q])[0]
        results = search_pgvector(vec)
        print("=" * 70)
        print("QUERY:", q)
        for row in results:
            metadata = row.get("metadata", {})
            title = metadata.get("title", metadata.get("document_title", ""))
            chunk_text = row.get("chunk_text", "")
            similarity = row.get("similarity", 0)
            print(f"  score={similarity:.4f} | {title} | {chunk_text[:70]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())