# Semantic Search Implementation Plan

## Overview
Add vector similarity search to Workflow 03 so the AI receives the most relevant knowledge chunks for each customer query, instead of just the 5 oldest chunks.

---

## What Changes

### Workflow 03 - Memory & Context Builder

**1 node added, 1 node modified**

| Node | Action |
|------|--------|
| Get Knowledge Chunks (simple) | **Modified** - Add vector similarity search |
| Generate Message Embedding | **Added** - HTTP Request to Groq embeddings API |

**No other workflows are affected.**

---

## Step-by-Step Implementation

### Step 1: Add Embedding Node

Add an **HTTP Request node** before "Get Knowledge Chunks (simple)":

```
Name: Generate Message Embedding
Type: HTTP Request (v4.4)

Method: POST
URL: https://api.groq.com/openai/v1/embeddings
Authentication: Header Authentication
Header: Authorization = Bearer {{ $env.GROQ_API_KEY }}

Body Content Type: JSON
Body: ={
  "model": "text-embedding-3-small",
  "input": "{{ $('When Executed by Another Workflow').item.json.message }}"
}

Output: JSON
Respond with: Complete Response
```

**Connection:** When Executed by Another Workflow → Generate Message Embedding

---

### Step 2: Modify Knowledge Query

Change the SQL in "Get Knowledge Chunks (simple)" from:
```sql
SELECT COALESCE(json_agg(... ORDER BY chunk_number), '[]'::json)
FROM knowledge_chunks
ORDER BY chunk_number
LIMIT 5
```

To:
```sql
SELECT COALESCE(
  json_agg(
    json_build_object(
      'chunk_text', kc.chunk_text,
      'metadata', kc.metadata,
      'source', kd.title,
      'similarity', 1 - (kc.embedding <=> $1::vector)
    )
    ORDER BY kc.embedding <=> $1::vector
  ),
  '[]'::json
) AS knowledge
FROM knowledge_chunks kc
JOIN knowledge_documents kd ON kd.id = kc.document_id
WHERE kd.status = 'indexed'
  AND kc.embedding IS NOT NULL
LIMIT 10
```

**Query Replacement:** `={{ $json.data[0].embedding }}`

---

### Step 3: Update the JS Code Node

The "Get Knowledge Chunks" code node already handles the output format correctly - no changes needed.

---

### Step 4: Set Environment Variable

In n8n, add `GROQ_API_KEY` to your credentials or environment variables.

---

## Data Flow After Change

```
When Executed by Another Workflow
    │
    ├──► Get Contact ─► Get Conversation ─► Get Recent Messages ...
    │
    └──► Generate Message Embedding ──► Get Knowledge Chunks (semantic)
                                              │
                                              └──► Get Products ─► ...
```

---

## Similarity Threshold

Add a WHERE clause to filter low-similarity results:
```sql
AND 1 - (kc.embedding <=> $1::vector) > 0.5
```

This excludes chunks with less than 50% similarity.

---

## Validation Steps

1. **Test Workflow 03 manually** with a known query
2. **Check similarity scores** - should be 0.7+ for relevant chunks
3. **Verify HNSW index usage** - run `EXPLAIN ANALYZE` on the query
4. **Test fallback** - if no embeddings exist, query still works via LIMIT fallback

---

## Fallback Behavior

If `kc.embedding IS NULL` (no embeddings in DB), the query returns empty. 
Add a fallback query for unembedded data:
```sql
AND (kc.embedding IS NOT NULL OR kd.status = 'indexed')
ORDER BY COALESCE(kc.embedding <=> $1::vector, 1)
```

---

## Open Questions

1. **Model choice:** `text-embedding-3-small` (1536 dims) vs `embed-english-v3.0` (1024 dims)?
   - Recommendation: `text-embedding-3-small` - smaller, faster, good quality

2. **Store embeddings?** Store message embeddings in `memory_embeddings` table for future context?
   - Recommendation: Skip for now, add later if needed

3. **Number of chunks:** Increase from 10 to 20?
   - Recommendation: Start with 10, adjust based on token limits
