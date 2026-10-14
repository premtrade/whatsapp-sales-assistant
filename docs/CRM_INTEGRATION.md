# CRM Integration (Odoo)

The WhatsApp Sales Assistant can push qualified leads and accepted quotes into an
external CRM so your sales team works from a single system of record. The first
supported CRM is **Odoo** (via its External **JSON‑2 API**, Odoo 17/18/19+). The
design is provider‑agnostic, so additional CRMs (HubSpot, Salesforce, Pipedrive,
…) can be added later as drop‑in adapters.

## What gets synced

| Local entity | Odoo model | When it syncs | Direction |
| --- | --- | --- | --- |
| `contacts` | `res.partner` | automatically, as a dependency of lead/quote sync | app → CRM |
| `lead_scores` | `crm.lead` | when a lead is marked **qualified** or **converted** | app → CRM |
| `quotes` (+ `quote_items`) | `sale.order` (+ `order_line`) | when a quote is **accepted** | app → CRM |

Sync is **idempotent**: a `crm_record_map` table stores the external record id for
each local entity, so re‑syncing updates the existing Odoo record instead of
creating duplicates. Contacts are de‑duplicated in Odoo by email (then phone) on
first sync.

Sync is **best‑effort and never blocks a sale**: the triggers fire‑and‑forget, and
any Odoo error is logged without failing the originating request (marking a lead
qualified or accepting a quote always succeeds even if the CRM is down).

## 1. Prepare Odoo

1. Create a **dedicated bot user** in Odoo (Settings → Users & Companies → Users).
   Give it the minimum rights it needs: Sales/User for CRM + Sales for quotations.
   You may leave its password empty to disable interactive login.
2. Generate an **API key** for that user (Preferences → Account Security → New API
   Key). Copy it — Odoo shows it only once.
3. Note your Odoo **base URL** (e.g. `https://odoo.example.com`) and **database
   name**. The database name is required when one Odoo server hosts several
   databases; single‑database deployments (odoo.sh) can usually leave it blank.

> The JSON‑2 API is available on Odoo 17+. Older instances can use XML‑RPC or
> JSON‑RPC — that would be a future adapter; today this integration targets
> JSON‑2 only.

## 2. Connect from the dashboard

1. Sign in as an **admin** and open **Settings → Integrations**.
2. Choose **Provider = Odoo**, paste the **URL**, **Database** and **API key**,
   and toggle **Enable automatic CRM sync** on.
3. Click **Test connection** — this calls `res.users/context_get` and confirms the
   URL, database and key are valid before you rely on it.
4. Save.

Credentials are stored **per business (tenant)** in the `settings` table, scoped
by `business_id`, exactly like the WhatsApp configuration. The raw API key is
never returned by the API (only a `hasApiKey` boolean), and saving the form
without re‑typing the key leaves the stored credential untouched.

## 3. API reference (admin only)

All routes require a valid staff JWT and an active subscription. Writes require
the `admin` role.

```
GET  /api/integrations/crm        # current settings (API key masked)
PUT  /api/integrations/crm        # save settings
POST /api/integrations/crm/test   # verify the stored Odoo connection
```

`PUT /api/integrations/crm` body:

```json
{
  "provider": "odoo",            // "odoo" | "none"
  "enabled": true,
  "odoo": {
    "url": "https://odoo.example.com",
    "database": "mydb",
    "apiKey": "optional-only-if-changing"
  }
}
```

## 4. How it works under the hood

```
leadScore.service.ts  (qualified/converted) ─┐
                                              ├─> crm.service.ts ─> odoo.service.ts ─> Odoo JSON-2
quote.service.ts      (accepted) ────────────┘        │
                                                      └─> crm_record_map (idempotency)
```

- **`services/integrations/crm.types.ts`** — the `CrmAdapter` contract and the
  normalized inputs (`CrmContactInput`, `CrmLeadInput`, `CrmQuoteInput`, …).
- **`services/integrations/odoo.service.ts`** — the Odoo adapter. Each call is a
  single `POST {url}/json/2/{model}/{method}` with `Authorization: Bearer {key}`
  and `X-Odoo-Database` headers, and a body of named parameters:
  - `create` → `{ "vals_list": [ { … } ] }`
  - `write` → `{ "ids": [id], "vals": { … } }`
  - `search_read` → `{ "domain": [...], "fields": [...], "limit": 1 }`
  - `message_post` → `{ "ids": [id], "body": "<p>…</p>" }`
- **`services/crm.service.ts`** — resolves per‑tenant settings, selects the
  adapter, reads/writes the idempotency map, and exposes the fire‑and‑forget
  `syncLeadToCrm()` / `syncQuoteToCrm()` used by the triggers.
- **`controllers/integration.controller.ts`** + **`routes/integration.routes.ts`**
  — the dashboard API.
- **`database/migrations/070_crm_integration.sql`** — the `crm_record_map` table.

Each JSON‑2 call runs in its own transaction on the Odoo side, so a multi‑step
sync (contact → lead) is not atomic. The idempotency map makes retries safe: if a
step fails, the next sync resumes from the stored ids.

## 5. Adding another CRM

1. Implement `CrmAdapter` in a new file under `services/integrations/` (e.g.
   `hubspot.service.ts`).
2. Widen the adapter method signatures from `OdooConfig` to a shared `CrmConfig`
   (or a discriminated union) — the current signature is Odoo‑specific on purpose
   while Odoo is the only provider.
3. Register it in the `ADAPTERS` map in `crm.service.ts` and extend the settings
   keys + `saveCrmSettings`/`getCrmSettings` with the new provider's credentials.

## 6. Troubleshooting

- **"Test connection" fails** — double‑check the URL (include `https://`), the
  database name, and that the API key belongs to an active user with Sales access.
  Check the backend logs for the exact Odoo error (the adapter surfaces Odoo's
  `name`/`message`).
- **Sync silently skipped** — the trigger logs `CRM sync skipped` when sync is
  disabled, the provider isn't `odoo`, or credentials are incomplete. Confirm
  `crm_sync_enabled = true` and that URL + API key are saved.
- **Duplicate records** — shouldn't happen thanks to `crm_record_map`, but the
  contact de‑dup relies on a matching email/phone in Odoo. Inspect the
  `crm_record_map` rows for the tenant to see what has been mapped.

