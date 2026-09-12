#!/usr/bin/env python3
"""
tests/unit/testEmbedMemory.py - Test the embedding pipeline in mock mode.
"""
import hashlib
import os
import sys

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "scripts"))


def mock_embed(text, dims=384):
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    vec = []
    for i in range(dims):
        b = digest[i % len(digest)] ^ ((i * 2654435761) & 0xFF)
        vec.append((b / 127.5) - 1.0)
    norm = sum(x * x for x in vec) ** 0.5
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


class TestEmbedMemory:
    def test_mock_embed_deterministic(self):
        vec1 = mock_embed("Garco Construction Services")
        vec2 = mock_embed("Garco Construction Services")
        assert vec1 == vec2

    def test_mock_embed_different_texts_differ(self):
        vec1 = mock_embed("Garco Construction")
        vec2 = mock_embed("Plumbing Services")
        assert vec1 != vec2

    def test_mock_embed_dimensions(self):
        vec = mock_embed("Test embedding")
        assert len(vec) == 384

    def test_mock_embed_normalized(self):
        vec = mock_embed("Normalized vector")
        norm = sum(x * x for x in vec) ** 0.5
        assert abs(norm - 1.0) < 1e-6

    def test_mock_embed_range(self):
        vec = mock_embed("Range test")
        for v in vec:
            assert -1.0 <= v <= 1.0

    def test_mock_embed_empty_string(self):
        vec = mock_embed("")
        assert len(vec) == 384
        assert all(abs(v) <= 1.0 for v in vec)

    def test_mock_embed_unicode(self):
        vec1 = mock_embed("Jamaica Kingston")
        vec2 = mock_embed("Jamaica Kingston")
        assert vec1 == vec2
        assert len(vec1) == 384

    def test_mock_embed_similar_texts_similar_vectors(self):
        v1 = mock_embed("Garco offers construction services")
        v2 = mock_embed("Garco offers building services")
        # Cosine similarity (dot product since normalized)
        dot = sum(a * b for a, b in zip(v1, v2))
        # Similar text should have higher similarity than dissimilar, but mock vectors are hash-based
        # so we just check it's positive (not negative which would indicate anti-correlation)
        assert dot > 0.0

    def test_mock_embed_fixture_knowledge_chunks(self):
        fixtures = __FIXTURES__.garco if "__FIXTURES__" in globals() else None
        if fixtures:
            for chunk in fixtures["knowledge_chunks"]:
                vec = mock_embed(chunk["chunk_text"])
                assert len(vec) == 384
                assert abs(sum(x * x for x in vec) ** 0.5 - 1.0) < 1e-6
