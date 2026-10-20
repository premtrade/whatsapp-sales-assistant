# Knowledge Base + AI Reply — Fix Runbook

_Last updated: 2026-10-19. Captures the state of the WhatsApp AI fixes, what's committed to the repo, and the manual n8n edits still required._

> **2026-10-19 — read this first.** The "AI does not use the knowledge base" and
> "the assistant greets customers as *Acme Corp*" problems were caused by n8n
> **not** resolving `{{ }}` expressions inside an AI Agent node's
> `options.systemMessage` (the model received the raw template), plus n8n
> Postgres nodes **silently dropping empty query parameters** (which dropped
> real customer messages). Both are fixed and verified on the live instance.
> See **[AI_PROMPT_AND_KNOWLEDGE_FIX.md](./AI_PROMPT_AND_KNOWLEDGE_FIX.md)**
> for the root cause, the fix and the scripts that re-apply it. The manual
> edits below are now optional - the scripts do the same work.

## ⚠️ Key fact: n8n does NOT read these repo files

`workflows/live/*.json` are **backups/exports only**. Your live n8n stores workflows in its own Postgres DB. **`git push` updates backend/frontend code + Docker images, but does NOT touch n8n workflows.** Every workflow change must be applied **inside the n8n UI** (or via a deliberate import). This doc is the process.

CI/CD (`ci.yml`) = fetch `main` over HTTPS → build backend+frontend → run migrations → reload nginx. It never imports workflows.

---

## ✅ Done and committed to `main`

| Commit | What |
|--------|------|
| `d5b3607e` | fix(whatsapp-migration): update only whatsapp_phone to avoid unique constraint violation |
| `2dade096` | fix(whatsapp): sync business identity + settings fallback for tenant resolution |
| `beadf93` | Repaired corrupted JSON in `08 - AI Output Processor` |
| `3ee5ec0` | WF2: removed LangChain tool nodes; intent-based routing (Switch → plain executeWorkflow for 05/06) |
| `530b5de` | Newline-separated query params (Insert AI Message + WF07 Audit Log) — fixes "invalid input syntax for type uuid" when a reply contains a comma |
| `15b15ec` | WF2: AI extracts appointment/quote details into JSON; router passes them to tools |
| `earlier` | Backend `/api/knowledge/embed` endpoint; local `all-mpnet-base-v2` embeddings; `/health` uses node fetch (not wget); server `origin` remote switched to HTTPS |

## ✅ Done on the server (live)

- Backend rebuilt with `/embed` endpoint (verified: returns a 768-dim vector).
- Workflow 03 live: embed node → `http://backend:4000/api/knowledge/embed`; threshold `0.35` → `0.20`.
- AI Brain live: LangChain tool nodes removed (bot now replies instead of crashing on tool calls).
- Server `origin` git remote = HTTPS (CI deploy fetch works).

## 🔧 Remaining manual n8n edits (apply in the UI)

These are in the repo but NOT yet in live n8n unless you applied them by hand.

### 1. Insert AI Message — comma bug (crashes on any reply with a comma)
**WF2 → "Insert AI Message" → Options → Query Parameters.** Make it **newline-separated** (Enter between each, no commas):
```
={{ String($('When Executed by Another Workflow').first().json.conversation_id || '') }}
={{ String($('Parse AI Output').first().json.reply || '') }}
={{ String($('When Executed by Another Workflow').first().json.business_id || '') }}
```

### 2. Business name ("our company" greeting)
The AI Agent system message uses `{{ $json.business_name }}` which is empty at that node. Change both occurrences to:
```
{{ $('Format Context').first().json.business_name || 'our company' }}
```
(First confirm "Format Context" output has `business_name` = `ROLINJ.IO - Automation & AI Solutions`.)

### 3. Appointment/quote detail extraction (optional, richer tool calls)
- **AI Agent system message:** add rule to emit optional keys `appointment_type, appointment_title, appointment_location, appointment_date (YYYY-MM-DD), appointment_time (HH:MM 24h), appointment_duration, quote_product, quote_quantity`.
- **Parse AI Output:** pass those keys through (e.g. `appointment_date: String(parsed.appointment_date || '')`).
- **Route Appointment / Route Quote:** point inputs at `$('Parse AI Output').first().json.<field>`.

---

## 🧪 Test checklist (send over WhatsApp)
1. "Can I speak with a manager?" → replies + handoff created (WF08 path).
2. "What are your services?" → answers from the uploaded ROLINJ doc (not generic).
3. "Book a site visit tomorrow 3pm" → replies + appointment routed with date/time.
4. Any reply containing a comma → no crash (validates fix #1).

## 🔎 Debug: where to look in an execution
- **"Get Knowledge Chunks (semantic)"** → `knowledge` should contain your doc text (not `[]`). If `[]`, retrieval/threshold issue.
- **"Format Context"** → `business_name` should be `ROLINJ.IO...`.
- **"Generate Message Embedding"** → array of numbers (not an error).
- **"Insert AI Message"** → no `invalid input syntax for type uuid`.

---

## Known constraints
- Groq account only offers `gpt-oss-120b` / `gpt-oss-20b` as chat models. Both have a tool-calling bug (emit calls in a `commentary` channel n8n rejects). **Do not use LangChain tool nodes with these models** — route actions by intent in a Switch instead (already done in WF2).
- n8n `import:workflow` on Postgres creates a NEW id each run → duplicates. Auto-import was intentionally NOT wired up. Apply workflow changes manually.