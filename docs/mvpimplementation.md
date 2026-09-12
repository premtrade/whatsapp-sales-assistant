# MVP Implementation Plan

## Phase 1: Customer Facts — ✅ Completed (2026-08-17)

**What was fixed:**
1. **Budget extraction fix** — Updated the `Extract Customer Facts` agent in `04 - Memory Writer.json` to preserve budget as a string with currency (e.g., `JMD 20,000`).
2. **Pipeline consolidation** — Reordered Workflow 2: Trigger → Memory Writer (fact extraction + save) → Memory & Context Builder → AI Agent → Insert Message → WAHA Send → Update Conversation → Audit Log.
3. **Duplicate-key UPSERT** — Changed to `json_to_recordset($1::json)` to preserve commas in values like `JMD 20,000`.

## Phase 2: Memory & Context — ✅ Completed (2026-08-17)

**What was validated:**
1. Fixed `Get Conversation Summary` query to select correct schema columns.
2. Added migration `026_align_conversation_summaries.sql` to align database schema.
3. Validated all 10 Workflow 3 SQL queries against live database.
4. Confirmed context package structure matches AI Agent's prompt expectations.

## Phase 3: Knowledge Base — ✅ Completed (2026-08-17)

**What was built/validated:**
1. **Qdrant collection ready** — `whatsapp_sales` collection confirmed (384-dim, Cosine distance).
2. **Created `scripts/embed_memory.py`** — Embedding/indexing pipeline:
   - Reads unembedded `knowledge_chunks` from PostgreSQL
   - Generates embeddings via Hugging Face API (or mock mode)
   - Upserts to Qdrant and records `qdrant_point_id`
3. **Ran pipeline (mock mode)** — 14 total knowledge chunks embedded (4 seed FAQ + 10 Garco Business Directory):
   - ✅ Qdrant has **14 points**
   - ✅ `memory_embeddings` has **14 `completed` rows**
   - ✅ All chunks have `qdrant_point_id` populated
4. **Created `tests/test_qdrant_retrieval.py`** — Validates store→retrieve round-trip.
5. **Grounding active via pg_trgm** — Workflow 3 uses pg_trgm similarity to ground AI on exact FAQ text.

### Phase 3.1: Garco Document Seeding — ✅ Completed

**Migration `027_seed_garco_document.sql`** added 10 authoritative knowledge chunks covering:
- Company identity and services
- General Construction Consultation (contact for quote)
- Payment terms (no financing, full amount due before work)
- Contact information
- AI hallucination prevention rules

## Phase 4: Quotes — ✅ Completed (2026-08-17)

**What was implemented:**
1. **Updated Quote Tool workflow** (`Workflow 6 — Quote Tool.json`):
   - Now takes `product_identifier` (SKU or name like 'General Construction Consultation') instead of product_id
   - Added `Look up Product` node that queries the database for authentic pricing
   - Removed AI-provided `unit_price` - price is now fetched from the products table
   - Tool validates product exists before creating quote
   - Returns formatted quote with authentic pricing

2. **Updated AI Brain** (`Workflow 2 - AI Brain.json`):
   - Quote Tool call now passes `product_identifier` instead of `product_id`/`unit_price`
   - AI instructions updated: "Do NOT ask the customer to provide a price. Never invent a price, tax, or discount."
   - AI calls Quote Tool with product name/SKU when customer requests a quote

3. **Created `quote-tool-v2`** workflow ID with:
   - Product lookup from database
   - Quote creation with authentic pricing
   - Error handling for unknown products

## Phase 5: Appointments — ✅ Completed (2026-08-17)

**What was implemented:**
1. **Updated Appointment Tool** (`05 - Appointment Tool.json`):
   - Added `Validate Inputs` node to check required date/time fields
   - Added `Check for Conflicts` node that queries for overlapping appointments
   - Added `Format Conflict Result` and `Prepare Result` nodes for decision flow
   - Tool now returns success with appointment details OR error with conflict info
   - AI never schedules an appointment without checking for conflicts first

2. **Updated AI Brain** (`Workflow 2 - AI Brain.json`):
   - Appointment Tool call now passes all extracted parameters:
     - `appointment_type`, `title`, `location`, `preferred_date`, `preferred_time`, `duration_minutes`
   - AI extracts these values from customer message using $fromAI() function
   - AI does not hardcode schedule times

3. **Conflict Prevention:**
   - Tool checks for overlaps with existing scheduled/claimed appointments
   - Returns `has_conflict: true` with details if time slot is taken
   - AI can then ask for alternative times

## Phase 6: Handoff — Not Started

**TODO:** Solidify Workflow 7 - Handoff Tool for human escalation.

## Phase 7: AI Brain Polish — Not Started

**TODO:** Fine-tune master system prompt in Workflow 2.

## Phase 8: Full Regression Testing — Not Started

**TODO:** Run tests for Address Conflict, Unknown Service, Returning Customer, WhatsApp end-to-end.

## Phase 9: Frontend — Not Started

**TODO:** Build operational dashboard (Conversations, Customers, Leads, Handoffs).

## Phase 10: Production Packaging — Not Started

**TODO:** Finalize Docker configs, hide secrets in `.env`, establish backups, write documentation.