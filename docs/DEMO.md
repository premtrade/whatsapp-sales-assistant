# The demo tenant

WAFLO's marketing site shows screenshots of the running product rather than
drawings of it, and a visitor can message the real assistant. Both come from
one place: a demo tenant that is a showcase instance of **ROLINJ.IO**.

## Why ROLINJ.IO

The demo is the same business, the same services and the same knowledge base
that the live agent answers from — on a tenant of its own, so nothing a real
customer has written can ever be published.

It is ROLINJ.IO because:

- **It is already wired.** The live tenant has a connected WhatsApp number, a
  live WhatsApp session, an indexed knowledge base and a working agent. Using
  it means no second number to buy, no second session to pair and no second
  knowledge base to maintain.
- **The demo and the live agent cannot drift.** The knowledge base is copied
  from the live ROLINJ.IO tenant on every seed, embeddings and all, so the
  answers on the demo page are the answers a visitor gets when they message
  the number.
- **It is a real business with a real audience.** ROLINJ.IO sells automation
  to small and medium businesses in Jamaica and the Caribbean, which is the
  same buyer the product is for.

### What stays fictional, and why

The **showcase conversation** is written, not real. ROLINJ.IO's tenant holds
482 messages from real people — enquiries from customers whose names and
numbers are in the database. Publishing any of them on an unauthenticated
endpoint would put a real person's words on the internet. The demo tenant
exists so that the public page can show the product without touching anyone's
data.

The **lead names** are invented for the same reason.

### The pricing, which is the interesting part

ROLINJ.IO publishes no prices, and its knowledge profile is explicit: no
starting prices were ever verified, and the assistant must never make a figure
up. So the demo does not show one.

The assistant in the demo conversation declines to quote, explains that pricing
depends on the workflow, the tools and the integrations, and offers a free
consultation instead. The quotes in the database are real documents with a real
scope and a zero amount.

That is a stronger demonstration than a confident number. A visitor who is
sceptical of AI agents wants to see one refuse to invent a price, not one
invent one.

## What is in the tenant

| | |
|---|---|
| Business | ROLINJ.IO - Automation & AI Solutions. `businesses.metadata` carries `is_demo: true` and `public_demo: true`. |
| Services | ROLINJ.IO's real plans — Starter, Pro and the Digital Transformation Suite. No prices; `metadata.pricedAfterDiscovery` is set on each. |
| Enquiries | Four conversations spread over the last ten days, so the dashboard charts a real 30 day activity curve rather than a single flat point. |
| Quotes | One sent and one accepted, both with a scope and a zero figure, so the pipeline shows a 50% conversion rate without claiming a price. |
| Appointments | One completed consultation, one confirmed, one scheduled. |
| Knowledge base | ROLINJ.IO's two real documents, 32 chunks, copied from the live tenant with their embeddings. |
| Staff | Two demo accounts (`demo.admin@waflo.demo`, `demo.manager@waflo.demo`). The `.demo` domain is reserved for exactly this. |

## Running it

The seed is idempotent: it removes the previous demo tenant and recreates the
set. Everything except `staff_users` cascades from the business, and those
rows are removed explicitly because `staff_users.business_id` is
`ON DELETE SET NULL` and their unique email would otherwise block the next
insert.

```bash
# On the server, inside the backend container
docker exec <backend-container> node dist/scripts/seed-demo.js

# Or locally against a database
cd backend && npm run seed:demo

# With a specific password
npm run seed:demo -- --password='...' --email='...'
```

The password can also come from `DEMO_ADMIN_PASSWORD`, which is what the
server uses.

## The public demo surface

`GET /api/demo` is the only unauthenticated endpoint that reads tenant data, so
it is deliberately narrow:

- The tenant is resolved from a fixed slug. Nothing the caller sends can
  influence which tenant is read — there is no business id, tenant id or
  header in the request.
- The business must also be marked `is_demo`, so a slug collision with a real
  business cannot expose it.
- Every statement filters on that business id.

The demo page at `/demo` renders the showcase conversation with the same
`MessageBubble` component the dashboard uses, so a visitor sees the product's
own markup rather than a picture of it.

## The number a visitor can message

`DEMO_AGENT_WHATSAPP_NUMBER` is **configuration**, not tenant data. A tenant's
`whatsapp_phone` can be a placeholder, and publishing one would send a
visitor to a stranger's phone. The number comes from the environment:

```bash
DEMO_AGENT_WHATSAPP_NUMBER=18767998637
DEMO_AGENT_WHATSAPP_NAME=ROLINJ.IO
```

If it is empty the "message our agent" button is not rendered at all.

It is ROLINJ.IO's real, connected number, so there is no second SIM to buy
and no second line to pay for. A visitor who messages it reaches the real
assistant, on the real knowledge base, and gets a real answer.

**One consequence worth knowing:** because it is the real number, a visitor's
message arrives in ROLINJ.IO's actual inbox alongside real enquiries. That is
the point — it is a working lead channel, not a sandbox.

## Screenshots

The marketing images are taken from the running product, not mocked up:

```bash
node scripts/screenshot-demo.mjs
```

It drives headless Chrome over the DevTools Protocol — no Puppeteer, no
image libraries — signs into the demo tenant, and captures:

| File | What it shows |
|---|---|
| `frontend/public/images/demo-conversation.jpg` | The showcase conversation, used in the landing page hero |
| `frontend/public/images/demo-dashboard.jpg` | The dashboard, used in the landing page |
| `frontend/public/images/demo-inbox.jpg` | The inbox |
| `frontend/public/images/demo-stats.jpg` | The stats panel on the demo page |

Set `DEMO_SITE_URL`, `DEMO_API_URL`, `DEMO_ADMIN_EMAIL` and
`DEMO_ADMIN_PASSWORD` to point it somewhere other than production.

The images are committed, so the site does not depend on a screenshot run to
build. Re-take them after changing the seed data, and note that the
conversation crop is tuned to the current thread length.
