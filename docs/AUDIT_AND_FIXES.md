# WhatsApp Sales Assistant — Audit & Fix Summary

## 1. Overview of Corrections Applied

### 1.1 Infrastructure & Environment (`docker-compose.yml`)
- Added `HF_API_KEY`, `HUGGINGFACE_API_KEY`, `OPENAI_API_KEY`, and `GROQ_API_KEY` to the `n8n` service container environment.
- Ensures HuggingFace API key is accessible by n8n nodes for generating 768-dimension vector embeddings.

### 1.2 Workflow 01: Incoming WhatsApp Message (`01 - Incoming WhatsApp Message.json`)
- Fixed field name typo `"=message"` to `"message"` in "Normalize Payload" node.
- Updated downstream execution of Workflow 2 to reference sanitized inputs (`$('Sanitize Inputs').item.json.message` and `message_id`).
- Changed sub-workflow invocation mode from fragile list ID (`u6LzGPItprCnpd9U`) to portable name mode (`"Workflow 2 - AI Brain"`).

### 1.3 Workflow 02: AI Brain (`Workflow 2 - AI Brain.json`)
- Corrected Groq model from invalid `openai/gpt-oss-120b` to active, supported `llama-3.3-70b-versatile`.
- Reconnected `Call '08 - AI Output Processor'` to output index 0 alongside `Insert AI Message`, resolving broken execution where output index 1 was ignored by n8n.
- Removed trailing newlines (`\n`) from sub-workflow parameter bindings for UUIDs, contact IDs, and phone numbers.
- Switched sub-workflow invocation of `03 - Memory & Context Builder` to name mode.

### 1.4 Workflow 03: Memory & Context Builder (`03 - Memory & Context Builder.json`)
- Prevented fatal pgvector `ERROR: cannot compute cosine distance for zero vector` when embeddings are unavailable or in fallback mode.
- In "Prepare Search Params", fallback vectors are mathematically valid non-zero unit vectors with a boolean flag `$3 (has_vector: false)`.
- Semantic search branch is conditionally guarded (`WHERE $3::boolean = true`), ensuring seamless fallback to trigram text similarity search (`similarity(kc.chunk_text, $2) > 0.1`) without database errors.
- Fixed malformed query replacement syntax to standard comma-separated parameter expressions.

### 1.5 Workflow 04: Memory Writer (`04 - Memory Writer.json`)
- Updated Groq model from non-existent `openai/gpt-oss-20b` to supported `llama-3.1-8b-instant`.

### 1.6 Workflow 08: AI Output Processor (`08 - AI Output Processor.json`)
- Guarded `INSERT INTO customer_facts` against inserting null `fact_key` / `fact_value`, preventing PostgreSQL `NOT NULL` constraint violations on messages where no facts are extracted.
- Converted `Call Handoff Tool` from `@n8n/n8n-nodes-langchain.toolWorkflow` (AI tool only) to `n8n-nodes-base.executeWorkflow` (sequential execution node).
- Harmonized target workflow name to `"07 - Handoff Tool"`.
- Reconnected single-output `Prepare Facts` node to dispatch downstream branches on `main[0]`.

### 1.7 Workflows 08B, 09, 10: Automated Sequences
- In `08 - Quote Follow-up Sequences.json`, fixed broken template syntax (`{{$json.display_name}}` inside JS template literals) and scoped variables to iteration loop.
- Added `WAHA Send Follow-up` / `WAHA Send Reminder` / `WAHA Send Recovery` HTTP POST nodes (`http://waha:3000/api/sendText`) so messages are actively delivered to customers via WhatsApp rather than just inserted into the database.

### 1.8 Workflow Importer Script (`scripts/import_workflows.py`)
- Added all 11 workflows to `WORKFLOW_ORDER` in correct dependency order.
