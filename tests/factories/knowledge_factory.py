#!/usr/bin/env python3
"""Knowledge base factories."""
import uuid


def make_knowledge_document(db_connection, **overrides):
    title = overrides.get("title", f"Test Document {uuid.uuid4().hex[:8]}")
    doc_type = overrides.get("document_type", "faq")
    source = overrides.get("source", "test")
    language = overrides.get("language", "en")
    status = overrides.get("status", "indexed")
    sql = f"""INSERT INTO knowledge_documents (title, document_type, source, language, status)
              VALUES ('{title}', '{doc_type}', '{source}', '{language}', '{status}')
              RETURNING id, title, document_type, status;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_knowledge_document failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "title": parts[1].strip(),
        "document_type": parts[2].strip(),
        "status": parts[3].strip(),
    }


def make_knowledge_chunk(db_connection, document_id, **overrides):
    chunk_number = overrides.get("chunk_number", 1)
    chunk_text = overrides.get("chunk_text", f"Test knowledge chunk {uuid.uuid4().hex[:8]}")
    embedding_model = overrides.get("embedding_model", "text-embedding-3-small")
    sql = f"""INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model)
              VALUES ('{document_id}', {chunk_number}, '{chunk_text}', '{embedding_model}')
              RETURNING id, document_id, chunk_number, chunk_text;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_knowledge_chunk failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "document_id": parts[1].strip(),
        "chunk_number": int(parts[2].strip()),
        "chunk_text": parts[3].strip(),
    }
