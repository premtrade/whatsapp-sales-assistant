# AI prompt + knowledge retrieval fix (multi-tenant safe)

**Date:** 2026-10-19
**Applies to:** n8n workflows 01 / 03 / 03b, all Postgres nodes, backend `aiContext` service
**Status:** applied to the live n8n instance and verified end to end

---

## 1. The two reported symptoms

1. Documents are uploaded and show as *indexed*, but the assistant answers
   "I don't have the details on our services".
2. The assistant greeted the customer with a company that is not the tenant's
   ("You're speaking with **Acme Corp**" / "Acme Solutions" for ROLINJ.IO).

Both had the same root cause, and it was **not** the model, the embedding model
or the knowledge base.

## 2. Root cause

`n8n` does **not** resolve `{{ }}` expressions inside an AI Agent node's
`options.systemMessage`. The raw template string is forwarded to the model
verbatim.

The live "Workflow 2 - AI Brain" had:

```text
options.systemMessage = "You are a WhatsApp sales assistant for {{ $('Format Context').first().json.business_name || 'our company' }}.
                        ...
                        === CONTEXT (authoritative) ===
                        {{ $('Format Context').first().json.formattedPrompt }}"
```

The model therefore received the *literal* placeholders. It had no business
name and no knowledge, so it:

* invented a plausible brand ("Acme Corp"), and
* answered from nothing and escalated ("Let me connect you with a
  representative").

Proof (replay of the exact live system message against the same model):

| System message | "Hi" | "What are your services?" |
|---|---|---|
| raw template (uninterpolated) | "Good evening! You're speaking with **Acme Corp**…" | "I'm sorry, I don't have the full list of services at hand…" |
| interpolated (context injected) | "You're speaking with ROLINJ.IO - Automation & AI Solutions" | answers with the six service categories from the KB |

The knowledge retrieval itself was healthy the whole time: the live
`03 - Memory & Context Builder` execution returned **29 chunks, best score
0.520 (high)** for the ROLINJ.IO tenant. The chunks were simply never
delivered to the model.

## 3. The fix

### 3.1 Prompt assembly (workflow `Workflow 2 - AI Brain`)

* `Format Context` now emits `finalPrompt` (business identity + local time +
  customer facts + knowledge chunks + recent conversation + the customer's
  message) and `business_name_known`.
* The AI Agent's `text` parameter (a **top level** parameter - n8n does
  resolve expressions there) is now
  `={{ $('Format Context').first().json.finalPrompt }}`.
* `options.systemMessage` contains **static rules only** - no expressions, so
  nothing can silently resolve to an empty string.
* `Parse AI Output` adds two guards:
  * a **deterministic greeting** for pure greetings ("Hi", "good evening", …):
    the reply is generated with the exact business name from the database, so
    the assistant can never be wrong about who it is;
  * a **company name guard** that replaces a foreign "… Corp / … Solutions /
    … Ltd" with the tenant's own name.
* The customer facts are de-duplicated (they used to repeat 28 times with
  contradictory values).

### 3.2 Tenant identity (`03 - Memory & Context Builder`)

The hard coded fallback `business_name: … || 'ROLINJ.IO'` was removed. An
unresolved tenant now stays unresolved (`business_name_known: false`) and the
prompt tells the assistant not to name any company at all. The fallback
belonged to one tenant and would have leaked into every other tenant.

### 3.3 n8n Postgres nodes silently dropped empty parameters

The n8n Postgres node (typeVersion >= 2.5) evaluates every `{{ }}` expression
in `options.queryReplacement` on its own and **drops empty strings**. One empty
value shifted every following parameter and the node failed with
`there is no parameter $6`.

In production this killed real customer messages: `Upsert Contact` passes
`wa_lid`, which is empty for every message that arrives on a normal `@c.us`
number, so those messages were dropped before the AI ever saw them.

Fix (all workflows, 54 nodes):

```text
before: ={{ $json.a }}, {{ $json.b }}, {{ $json.c }}
after : ={{ [String(($json.a) ?? ''), String(($json.b) ?? ''), String(($json.c) ?? '')] }}
```

An array is pushed item by item (only `undefined` is skipped), so empty values
stay aligned with the SQL placeholders. The SQL casts were hardened as well
(`$1::uuid` → `NULLIF($1, '')::uuid`, `$1::jsonb` →
`COALESCE(NULLIF($1, '')::jsonb, '{}'::jsonb)`), and the `phone_verified`
expression no longer evaluates to NULL (it compared a value with `NULL`,
which yields NULL, and the column is NOT NULL).

### 3.4 Backend (repo, not yet deployed)

* `backend/src/services/aiContext.service.ts` - server side source of truth
  for the tenant identity: `getBusinessIdentity`, `getGreetingWord`,
  `isPureGreeting`, `buildGreetingReply`, `buildAiContext` (identity +
  knowledge + prompt).
* `backend/src/routes/ai.routes.ts` - `GET /api/ai/identity`,
  `GET /api/ai/identity/self`, `POST /api/ai/context`.
* `backend/src/controllers/knowledgeDiagnostics.controller.ts` -
  `GET /api/knowledge/diagnostics` (what is stored, is it retrievable, which
  business the assistant answers for) and `POST /api/knowledge/test-query`
  (what a question actually retrieves).
* Knowledge uploads may now target a tenant explicitly through the
  `X-Tenant-Id` header.

### 3.5 Dashboard

The knowledge page has a **Knowledge health** panel: the business name the
assistant uses, how many documents are actually retrievable, and a box to test
a question and see the retrieved chunks with their scores.

### 3.6 Workflow-to-workflow inputs must be strings

n8n validates the values an `executeWorkflow` node passes against the **child**
workflow's declared input fields. Those fields carry no explicit type, so n8n
treats them as strings and rejects a number:

```
Invalid input for 'limit' [item 0]   ('limit' expects a string but we got '50')
```

`03 - Memory & Context Builder` -> `Get Knowledge Chunks` passed
`limit: {{ 50 }}` (a number). The node has `continueOnFail`, so the whole
`03b - Knowledge Retriever` call was swallowed and the assistant received an
**empty knowledge block** - it answered "I don't have the details on our
services" while the retrieval itself worked perfectly.

Fix: pass those inputs as strings (`{{ String(50) }}`,
`{{ String(... || 60) }}`) and declare the child input types explicitly.

### 3.7 The repo exports are a backup - the live n8n is the source of truth

The repo copies of the n8n workflows had drifted (45 nodes). Syncing a stale
repo node into the live instance is dangerous: the stale copy of
`Get Knowledge Chunks` referenced the child workflow **by name** instead of by
ID and had no input schema, which broke the call with
"Workflow is not active and cannot be executed."

Rules:

1. After any manual edit in the n8n editor, run
   `python3 scripts/reconcile_workflows_with_live.py workflows workflows/live`
   **on the server** and commit the result.
2. Check the drift with
   `python3 scripts/verify_live_matches_repo.py workflows/live`
   (must report `0 difference(s)`).
3. Never sync a node to the live instance without looking at the live
   parameters first.

## 4. How to re-apply to a live n8n instance

```bash
# 1. patch the repo exports (prompt assembly + tenant identity)
python3 scripts/patch_workflows_ai_prompt.py workflows workflows/live

# 2. make the Postgres nodes parameter-safe
python3 scripts/fix_postgres_query_params.py workflows workflows/live
python3 scripts/fix_sql_param_casts.py workflows workflows/live

# 3. copy the changed node parameters into the live database
#    (workflow_entity = draft copy, workflow_history = executable copy)
python3 scripts/sync_workflow_nodes_to_live.py workflows/live --node-type n8n-nodes-base.postgres
python3 scripts/sync_workflow_nodes_to_live.py workflows/live --node "Format Context"
python3 scripts/sync_workflow_nodes_to_live.py workflows/live --node "Parse AI Output"
python3 scripts/sync_workflow_nodes_to_live.py workflows/live --node "Build Context Package"

# 4. reload n8n (the webhook is only registered ~45 s after the restart)
docker compose restart n8n && sleep 45

# 5. check that the repo and the live instance agree
python3 scripts/verify_live_matches_repo.py workflows/live
```

The repo exports are a faithful copy of the live instance
(`verify_live_matches_repo.py` -> `0 difference(s)`).

## 5. Verification (live instance, 2026-10-19)

| Check | Result |
|---|---|
| "Hi" | "Good evening! You're speaking with **ROLINJ.IO - Automation & AI Solutions**. How can I help you today?" |
| "What are your services?" | answers with the six service categories from the KB, `escalate: false` |
| "Hello, what are your services?" (message with a comma, `@c.us` number) | processed end to end, reply delivered to the conversation |
| "Where are you located and what is your website?" | "We don't have a public office address; we serve businesses throughout Jamaica and the Caribbean. You can visit our website at https://rolin-io.vercel.app/" |
| "Can I get an appointment for tomorrow at 3pm?" | "Sure, I've scheduled a free consultation for tomorrow, 2026-10-20 at 3 pm." (Appointment Tool executed) |
| Knowledge in the context (after the input-type fix) | 26 chunks, best score 0.315, confidence high |
| Business identity in the context | `ROLINJ.IO - Automation & AI Solutions`, `business_name_known: true` |
| Knowledge in the context | 29 chunks, best score 0.520 (high) |

## 6. Rules to keep in mind

* **Never put a dynamic value in an n8n AI Agent `options.systemMessage`.**
  Use the `text` parameter, or build the prompt in the backend.
* **A tenant identity is never guessed.** If it cannot be resolved, the
  assistant must not name a company.
* **An empty n8n Postgres parameter is dropped** - always pass the parameters
  as one array and guard the SQL casts.
* **Workflow inputs are strings** - a number passed to a child workflow is
  rejected and (with `continueOnFail`) fails silently.
* **The live n8n instance is the source of truth** - reconcile the repo
  exports after every manual edit.
