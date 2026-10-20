# The demo tenant

WAFLO's marketing site shows screenshots of the running product rather than
drawings of it. Those screenshots come from a seeded demo tenant, and the same
tenant backs the public demo page at `/demo`.

Everything in it is fictional: a Jamaican roofing business called Harbour Point
Roofing, with Jamaican phone numbers, JMD prices and Jamaica time.

## What is in it

| | |
|---|---|
| Business | Harbour Point Roofing, Kingston. `businesses.metadata` carries `is_demo: true`, `public_demo: true` and `demo_agent_live: false`. |
| Services | Seven roofing services priced in JMD, from a JMD 1,850/sq ft repair to a JMD 342,000 replacement. |
| Enquiries | Six conversations spread over the last ten days, so the dashboard charts a real 30 day activity curve rather than a single flat point. |
| Quotes | One sent (JMD 245,000 roof replacement) and one accepted (JMD 68,000 gutters), so the pipeline shows a 50% conversion rate rather than 0%. |
| Appointments | One confirmed site visit and one completed. |
| Knowledge base | Three documents with real 768 dimension embeddings, so the assistant can answer questions about the business instead of only describing itself. |

## Running it

The seed is idempotent: it removes the previous demo tenant and recreates the
set. Everything except `staff_users` cascades from the business, and those rows
are removed explicitly because `staff_users.business_id` is `ON DELETE SET NULL`
and their unique email would otherwise block the next insert.

```bash
# On the server, inside the backend container
docker exec <backend-container> node dist/scripts/seed-demo.js

# Or locally against a database
cd backend && npm run seed:demo

# With a specific password
npm run seed:demo -- --password='...' --email='...'
```

The password can also be supplied as `DEMO_ADMIN_PASSWORD`. It is stored in
`DEMO_ADMIN_PASSWORD` in the local `.env` so the screenshot script can sign in.

## The public demo surface

`GET /api/demo` is the only unauthenticated endpoint that reads tenant data, so
it is deliberately narrow:

- The tenant is resolved from a fixed slug. Nothing the caller sends can
  influence which tenant is read - there is no business id, tenant id or
  header in the request.
- The business must also be marked `is_demo`, so a slug collision with a real
  business cannot expose it.
- Every statement filters on that business id.

The demo page at `/demo` renders the showcase conversation with the same
`MessageBubble` component the dashboard uses, so a visitor sees the product's
own markup rather than a picture of it.

## Enabling the live WhatsApp demo

The seeded WhatsApp number is a placeholder and is **never published**. A
visitor must not be sent a message to a stranger's phone.

To turn on the live demo:

1. Get a second number dedicated to the demo, and pair it to the demo tenant
   through **Settings → WhatsApp** in the dashboard, exactly as a customer
   would.
2. Set the flag:

```sql
UPDATE businesses
   SET metadata = metadata || '{"demo_agent_live": true}'::jsonb
 WHERE slug = 'waflo-demo';
```

3. `GET /api/demo` then returns the number, and the landing page shows
   "Or message our demo agent on WhatsApp" with a `wa.me` link.

The assistant on that number is the real agent with the seeded knowledge base,
so it answers pricing, service area and inspection questions from the same
documents the screenshots show.

## Screenshots

The marketing images are taken from the running product, not mocked up:

```bash
node scripts/screenshot-demo.mjs
```

It drives headless Chrome over the DevTools Protocol - no Puppeteer, no image
libraries - signs into the demo tenant, and captures:

| File | What it shows |
|---|---|
| `frontend/public/images/demo-conversation.jpg` | The showcase conversation, used in the landing page hero |
| `frontend/public/images/demo-dashboard.jpg` | The dashboard, used in the landing page |
| `frontend/public/images/demo-inbox.jpg` | The inbox |
| `frontend/public/images/demo-stats.jpg` | The stats panel on the demo page |

Set `DEMO_SITE_URL`, `DEMO_API_URL`, `DEMO_ADMIN_EMAIL` and
`DEMO_ADMIN_PASSWORD` to point it somewhere other than production.

The images are committed, so the site does not depend on a screenshot run to
build. Re-take them after changing the seed data.
