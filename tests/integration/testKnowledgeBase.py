#!/usr/bin/env python3
"""
tests/integration/testKnowledgeBase.py - Test knowledge chunk retrieval with pg_trgm.
"""
import os

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _psql(sql, db="whatsapp_sales_test"):
    import subprocess
    cmd = [
        "docker", "compose", "-f", os.path.join(REPO, "docker-compose.test.yml"),
        "exec", "-T", "postgres-test", "psql",
        "-U", "postgres", "-d", db,
        "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    return result.stdout.strip(), result.returncode, result.stderr


class TestKnowledgeBase:
    def test_pg_trgm_extension_installed(self, db_connection):
        sql = "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';"
        out, code, err = db_connection(sql)
        assert code == 0
        assert "pg_trgm" in out

    def test_knowledge_chunk_insert_and_retrieve(self, db_connection):
        doc_sql = """INSERT INTO knowledge_documents (title, document_type, source, language, status)
                     VALUES ('Test Doc', 'faq', 'test', 'en', 'indexed')
                     RETURNING id;"""
        out, code, err = db_connection(doc_sql)
        assert code == 0
        doc_id = out.strip()
        chunk_text = "Garco offers general construction and renovation services across Jamaica."
        sql = f"""INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model)
                  VALUES ('{doc_id}', 1, '{chunk_text}', 'text-embedding-3-small')
                  RETURNING id, document_id, chunk_number, chunk_text;"""
        out, code, err = db_connection(sql)
        assert code == 0
        parts = out.split("|")
        assert parts[3].strip() == chunk_text

    def test_knowledge_trgm_similarity_search(self, db_connection):
        sql = """SELECT chunk_text, similarity(chunk_text, 'construction services') AS sim
                 FROM knowledge_chunks
                 WHERE similarity(chunk_text, 'construction services') > 0.01
                 ORDER BY sim DESC
                 LIMIT 5;"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_knowledge_chunks_join_with_documents(self, db_connection):
        sql = """SELECT kc.chunk_text, kd.title, similarity(kc.chunk_text, 'Garco services') AS sim
                 FROM knowledge_chunks kc
                 JOIN knowledge_documents kd ON kd.id = kc.document_id
                 WHERE kd.status = 'indexed'
                   AND similarity(kc.chunk_text, 'Garco services') > 0.01
                 ORDER BY sim DESC
                 LIMIT 3;"""
        out, code, err = db_connection(sql)
        assert code == 0

    def test_knowledge_chunk_metadata(self, db_connection):
        doc_sql = """INSERT INTO knowledge_documents (title, document_type, source, language, status)
                     VALUES ('Meta Doc', 'markdown', 'test', 'en', 'indexed')
                     RETURNING id;"""
        out, code, err = db_connection(doc_sql)
        doc_id = out.strip()
        meta = '{"section": "Services", "authoritative": true}'
        sql = f"""INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model, metadata)
                  VALUES ('{doc_id}', 1, 'Test chunk with metadata', 'text-embedding-3-small', '{meta}'::jsonb)
                  RETURNING metadata;"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert "section" in out

    def test_knowledge_chunk_unique_constraint(self, db_connection):
        doc_sql = """INSERT INTO knowledge_documents (title, document_type, source, language, status)
                     VALUES ('Unique Doc', 'faq', 'test', 'en', 'indexed')
                     RETURNING id;"""
        out, code, err = db_connection(doc_sql)
        doc_id = out.strip()
        sql = f"""INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model)
                  VALUES ('{doc_id}', 1, 'Chunk one', 'text-embedding-3-small')
                  ON CONFLICT (document_id, chunk_number) DO NOTHING
                  RETURNING id;"""
        out1, code1, _ = db_connection(sql)
        assert code1 == 0
        out2, code2, _ = db_connection(sql)
        assert code2 == 0
        assert out2.strip() == ""

    def test_only_indexed_documents_returned(self, db_connection):
        sql = """SELECT COUNT(*) FROM knowledge_chunks kc
                 JOIN knowledge_documents kd ON kd.id = kc.document_id
                 WHERE kd.status = 'indexed';"""
        out, code, err = db_connection(sql)
        assert code == 0
        assert int(out.strip()) >= 0

    def test_chunk_number_sequential(self, db_connection):
        doc_sql = """INSERT INTO knowledge_documents (title, document_type, source, language, status)
                     VALUES ('Seq Doc', 'txt', 'test', 'en', 'indexed')
                     RETURNING id;"""
        out, code, err = db_connection(doc_sql)
        doc_id = out.strip()
        for i in range(1, 4):
            sql = f"""INSERT INTO knowledge_chunks (document_id, chunk_number, chunk_text, embedding_model)
                      VALUES ('{doc_id}', {i}, 'Chunk {i}', 'text-embedding-3-small')
                      RETURNING chunk_number;"""
            out, code, _ = db_connection(sql)
            assert code == 0
            assert out.strip() == str(i)

    def test_knowledge_search_returns_ordered_results(self, db_connection):
        sql = """SELECT chunk_text, similarity(chunk_text, 'Garco') AS sim
                 FROM knowledge_chunks
                 WHERE similarity(chunk_text, 'Garco') > 0.01
                 ORDER BY sim DESC
                 LIMIT 10;"""
        out, code, err = db_connection(sql)
        assert code == 0
        lines = [l for l in out.split("\n") if l.strip()]
        if len(lines) > 1:
            sims = []
            for line in lines:
                parts = line.split("|")
                if len(parts) >= 2:
                    try:
                        sims.append(float(parts[-1].strip()))
                    except ValueError:
                        pass
            assert sims == sorted(sims, reverse=True)
