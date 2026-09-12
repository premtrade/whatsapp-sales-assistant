-- ============================================================
-- Phase 2 validation: run every SQL query embedded in
-- "03 - Memory & Context Builder.json" against the live DB.
-- All queries are SELECTs (no mutation). Fails loudly on error.
-- ============================================================

\set VERBOSITY verbose

-- Sample IDs from seed/live data
\set cid 'd27a10f9-6842-4c6d-b330-889af3057b60'
\set convid '6d48217b-9065-4291-90fb-e1a216a9080f'

\echo '=== 1. Get Contact ==='
SELECT id, phone, display_name, source, created_at, updated_at
FROM contacts WHERE id = :'cid';

\echo '=== 2. Get Conversation ==='
SELECT id, contact_id, channel, status, last_message_at, created_at, updated_at
FROM conversations WHERE id = :'convid';

\echo '=== 3. Get Recent Messages ==='
SELECT COALESCE(
    json_agg(
        json_build_object(
            'direction', direction,
            'sender_type', sender_type,
            'text_body', text_body,
            'created_at', created_at
        )
        ORDER BY created_at ASC
    ),
    '[]'::json
) AS messages
FROM (
    SELECT direction, sender_type, text_body, created_at
    FROM messages
    WHERE conversation_id = :'convid'
    ORDER BY created_at DESC
    LIMIT 10
) recent;

\echo '=== 4. Retrieve Customer Facts ==='
SELECT COALESCE(
  json_agg(
    json_build_object(
      'fact_key', fact_key,
      'fact_value', fact_value,
      'confidence', confidence
    )
    ORDER BY confidence DESC, updated_at DESC
  ),
  '[]'::json
) AS facts
FROM customer_facts
WHERE contact_id = :'cid';

\echo '=== 5. Get Conversation Summary (fixed 020 schema) ==='
SELECT
    COALESCE(
        (SELECT summary FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1),
        ''
    ) AS summary,
    COALESCE(
        (SELECT message_count FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1),
        0
    ) AS message_count,
    COALESCE(
        (SELECT created_by FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1),
        'none'
    ) AS created_by,
    (SELECT start_message_at FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1) AS start_message_at,
    (SELECT end_message_at FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1) AS end_message_at,
    (SELECT created_at FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1) AS created_at,
    (SELECT updated_at FROM conversation_summaries WHERE conversation_id = :'convid' LIMIT 1) AS updated_at;

\echo '=== 6. Get Knowledge Chunks (pg_trgm similarity) ==='
SELECT COALESCE(
  json_agg(
    json_build_object(
      'chunk_text', chunk_text,
      'metadata', metadata,
      'source', source_title
    )
    ORDER BY s DESC
  ),
  '[]'::json
) AS knowledge
FROM (
  SELECT
    kc.chunk_text,
    kc.metadata,
    kd.title AS source_title,
    similarity(kc.chunk_text, 'what services does Garco offer') AS s
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE kd.status = 'indexed'
  ORDER BY s DESC
  LIMIT 5
) AS chunks;

\echo '=== 7. Get Products ==='
SELECT COALESCE(
  json_agg(
    json_build_object(
      'id', id,
      'sku', sku,
      'name', name,
      'description', description,
      'price', price,
      'currency', currency,
      'unit', unit,
      'category', category,
      'product_type', product_type
    )
    ORDER BY name
  ),
  '[]'::json
) AS products
FROM products
WHERE active = true;

\echo '=== 8. Get Quotes ==='
SELECT COALESCE(
  json_agg(
    json_build_object(
      'id', id,
      'quote_number', quote_number,
      'status', status,
      'total', total,
      'currency', currency,
      'valid_until', valid_until
    )
    ORDER BY created_at DESC
  ),
  '[]'::json
) AS quotes
FROM quotes
WHERE contact_id = :'cid';

\echo '=== 9. Get Appointments ==='
SELECT COALESCE(
  json_agg(
    json_build_object(
      'id', id,
      'title', title,
      'status', status,
      'starts_at', starts_at,
      'ends_at', ends_at
    )
    ORDER BY starts_at DESC
  ),
  '[]'::json
) AS appointments
FROM appointments
WHERE contact_id = :'cid';

\echo '=== 10. Get Handoff ==='
SELECT COALESCE(
  json_agg(
    json_build_object(
      'id', id,
      'status', status,
      'reason', reason,
      'assigned_to', assigned_to,
      'created_at', created_at
    )
    ORDER BY created_at DESC
  ),
  '[]'::json
) AS handoffs
FROM handoffs
WHERE conversation_id = :'convid';

\echo '=== ALL QUERIES OK ==='