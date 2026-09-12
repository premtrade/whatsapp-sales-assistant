 Yes. And at this point I think the most useful thing is to **freeze the architecture and define the finish line**.

You are no longer designing the whole system from scratch. You have the database, Docker stack, WAHA, n8n, the three-workflow concept, and much of the supporting schema. The remaining work is to turn what exists into a **small, reliable, reusable production MVP**.

# WhatsApp Sales Engine — Production MVP Definition

## 1. What the MVP must accomplish

For a business such as **Garco Construction Services Limited**, a customer should be able to send a WhatsApp message such as:

> "Hi, my name is Leroy. I need a general construction consultation for my house in Kingston. My budget is JMD 200,000."

The system should:

1. Receive the WhatsApp message.
2. Identify/create the customer.
3. Identify/create the conversation.
4. Store the incoming message.
5. Extract customer facts.
6. Validate and save those facts.
7. Retrieve the customer's relevant history/context.
8. Retrieve authoritative business information.
9. Determine the customer's intent/lead stage.
10. Respond accurately without inventing business facts.
11. Retrieve/create a quote when appropriate.
12. Check appointment information when appropriate.
13. Escalate to a human when appropriate.
14. Send the response back through WhatsApp.
15. Record what happened.
16. Continue the conversation intelligently when the customer replies.

That is the MVP.

**It does not need to be a complete CRM, ERP, construction-management system or sophisticated frontend.**

---

# 2. Architecture to freeze

This is the architecture I recommend we stop changing:

```text
                    WHATSAPP SALES ENGINE
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   WORKFLOW 1          WORKFLOW 2          WORKFLOW 3
     INTAKE              AI BRAIN        MEMORY & CONTEXT
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                     CORE WORKFLOWS
                       4 ─ 5 ─ 6 ─ 7
                            │
                       PostgreSQL
                            │
              ┌─────────────┴─────────────┐
              │                           │
         BUSINESS A                 BUSINESS B
           Garco                    Pharmacy
              │                           │
        Knowledge                    Knowledge
        Products                     Products
        Rules                        Rules
        Prompts                      Prompts
        Settings                     Settings
```

The critical design principle is:

> **The engine is reusable. Business data is configurable.**

We should not build a separate AI architecture for Garco, then another one for a pharmacy.

Garco becomes one tenant/business configuration.

A pharmacy becomes another.

---

# 3. Workflow 1 — Intake

### Status

Much of this already exists.

### Production MVP requirements

Workflow 1 must:

```text
WAHA
 ↓
Receive WhatsApp event
 ↓
Normalize payload
 ↓
Identify contact
 ↓
Create/update conversation
 ↓
Store incoming message
 ↓
Call Workflow 2
```

It should pass a **standardized input contract** to Workflow 2.

For example:

```json
{
  "conversation_id": "...",
  "contact_id": "...",
  "phone": "...",
  "customer_name": "...",
  "message": "...",
  "message_id": "...",
  "hasMedia": false,
  "timestamp": "..."
}
```

### Important correction

We have just discovered that your current system has both:

```text
message
text_body
```

with `text_body` currently arriving as `null`.

For the reusable architecture, we should eventually standardize this.

**One canonical incoming-message field should be used by the engine.**

I'd use:

```text
message
```

because that is what your existing Intake workflow is actually supplying.

---

# 4. Workflow 2 — AI Brain

This is the main intelligence/orchestration workflow.

The production sequence should be:

```text
When Executed by Another Workflow
              │
              ▼
     Extract Customer Facts
              │
              ▼
     Validate Customer Facts
              │
              ▼
    Prepare Facts for Database
              │
              ▼
      Save Customer Facts
              │
              ▼
   Call Workflow 3
              │
              ▼
          AI Agent
              │
       ┌──────┼─────────┐
       ▼      ▼         ▼
     Quote  Appointment Handoff
       │      │         │
       └──────┼─────────┘
              ▼
      Generate Response
              │
              ▼
       Save AI Message
              │
              ▼
        Send via WAHA
              │
              ▼
        Audit / Update
```

This is where we are currently working.

---

# 5. Customer Facts — finish this first

This is your current immediate task.

We already have:

```text
customer_facts
```

with:

```text
id
contact_id
fact_key
fact_value
confidence
source
created_at
updated_at
```

and importantly:

```text
uq_customer_fact
UNIQUE (contact_id, fact_key)
```

So the database foundation is good.

### Remaining work

Finish:

```text
Information Extractor
        ↓
Validate Customer Facts
        ↓
Prepare Facts
        ↓
Save Customer Facts
```

Then test:

```text
customer_name
service_interest
property_type
location
project_description
budget
preferred_date
preferred_time
urgency
company
email
preferred_language
```

### Fix two known problems

We already know:

**Problem 1:**

The database save configuration has been producing the wrong mapping around `confidence/source`.

**Problem 2:**

The extractor has converted:

```text
JMD 20,000
```

into:

```text
JMD 20
```

That must be fixed.

### Definition of done

A message such as:

> My name is Leroy. I need a general construction consultation for my house in Kingston. My budget is JMD 200,000.

must result in reliable database facts:

```text
customer_name       = Leroy
service_interest    = General Construction Consultation
property_type       = house
location            = Kingston
budget              = JMD 20,000
```

with:

```text
source = ai
```

and no duplicate rows when the workflow runs again.

---

# 6. Workflow 3 — Memory & Context Builder

This is where we previously got tangled.

**Do not rebuild Workflow 3.**

Keep the original architecture:

```text
When Executed by Another Workflow
             ↓
Get Contact
             ↓
Get Conversation
             ↓
Get Recent Messages
             ↓
Get Customer Facts
             ↓
Get Conversation Summary
             ↓
Get Knowledge Chunks
             ↓
Get Products
             ↓
Get Quotes
             ↓
Get Appointments
             ↓
Get Handoff
             ↓
BUILD CONTEXT
             ↓
Return to Workflow 2
```

The important architectural distinction is:

### Workflow 2 decides what to do.

### Workflow 3 gathers what Workflow 2 needs to know.

That eliminates the duplication problem we identified.

---

# 7. Memory/context

Workflow 3 should eventually return a structured context object something like:

```json
{
  "customer": {},
  "conversation": {},
  "recent_messages": [],
  "customer_facts": [],
  "conversation_summary": {},
  "business_knowledge": [],
  "products": [],
  "quotes": [],
  "appointments": [],
  "handoff": {}
}
```

The AI Agent receives that context.

### Definition of done

Given a returning customer, the AI can understand:

> "What did this customer already tell us?"

without asking for the same information again.

---

# 8. Knowledge Base

This is the next major component.

You already have:

```text
knowledge_documents
knowledge_chunks
vw_ai_knowledge
```

The MVP needs a reliable path:

```text
Business document
       ↓
Knowledge document
       ↓
Chunks
       ↓
Retrieval
       ↓
Workflow 3
       ↓
AI Agent
```

For Garco, the authoritative document you supplied becomes the initial business knowledge source.

The AI must distinguish:

```text
BUSINESS FACT
```

from:

```text
CUSTOMER FACT
```

This is extremely important.

For example:

> Customer budget = JMD 20,000

must never become:

> Garco price = JMD 20,000.

### Definition of done

Ask:

> "What services does Garco provide?"

and the assistant answers from the approved Garco knowledge.

Ask:

> "How much does a general construction project cost?"

and it **doesn't invent a price**.

Ask:

> "What are your office hours?"

and it doesn't invent hours.

That is production-grade behavior.

---

# 9. Quote retrieval — Core Workflow 4

The MVP doesn't need a sophisticated quoting engine.

It needs a reliable mechanism to:

```text
Customer asks for quote
        ↓
Identify service/product
        ↓
Collect required information
        ↓
Check existing quote data
        ↓
Generate/retrieve quote
        ↓
Return authoritative result
```

Your existing:

```text
quotes
quote_items
vw_quote_summary
```

provide the foundation.

### Important

The AI must **not calculate an arbitrary Garco price** unless an authorised pricing mechanism/data source tells it to.

For Garco, your authoritative document explicitly says there is no general price list.

Therefore:

```text
Quote request
     ↓
Collect requirements
     ↓
Quote workflow
     ↓
Human/authorised pricing if necessary
```

---

# 10. Appointment context — Core Workflow 5

You already have:

```text
appointments
vw_appointment_schedule
```

The MVP needs:

```text
Customer requests appointment
        ↓
Determine required appointment information
        ↓
Check availability
        ↓
Offer confirmed slot
        ↓
Customer confirms
        ↓
Create appointment
```

The AI must **never invent availability**.

For example, it must not say:

> "We can see you Tuesday at 10 AM."

unless the appointment system actually confirms it.

---

# 11. Handoff — Core Workflow 6

You already have:

```text
handoffs
staff_users
```

The MVP needs a clean handoff tool.

Triggers include:

```text
Customer requests human
Unknown business information
Complaint
Technical question
Legal/contract question
Exception request
Quote requiring human approval
AI cannot confidently answer
```

The AI response should be simple:

> "Absolutely. I'll arrange for someone from Garco to assist you."

Then:

```text
Handoff Tool
      ↓
handoffs table
      ↓
human queue
```

---

# 12. Workflow 7 — final operational workflow

This should handle whatever remaining operational function we have designated for Workflow 7.

The important point is that **Workflow 2 should not contain all the business operations itself**.

It should orchestrate specialized tools/workflows.

That is what makes the engine reusable.

---

# 13. AI Agent / master prompt

Once the underlying systems work, we improve the AI prompt.

This should happen **after** facts, context, knowledge, quotes, appointments and handoff are working.

The AI prompt should define:

### Role

You are the business's WhatsApp sales/customer assistant.

### Knowledge hierarchy

```text
Authorised business database
        ↓
Official/approved business knowledge
        ↓
Approved internal information
        ↓
Customer-provided information
```

### Hard rules

Never:

* invent prices
* invent services
* invent policies
* invent availability
* invent employees
* invent addresses
* invent warranties
* confuse customer facts with business facts
* use another customer's information

### Sales behavior

The AI should:

```text
Understand
 ↓
Qualify
 ↓
Answer
 ↓
Ask next useful question
 ↓
Move toward quote/appointment/handoff
```

rather than simply chatting indefinitely.

---

# 14. Conversation state and lead state

You already have:

```text
conversation_state
lead_stage
lead_status
priority
qualification_score
sales_metadata
```

These need to become operational rather than merely database fields.

For example:

```text
lead_stage

new
 ↓
qualified
 ↓
quote_requested
 ↓
quote_sent
 ↓
appointment_requested
 ↓
appointment_booked
 ↓
won / lost / handoff
```

The exact states can be finalized during regression testing.

---

# 15. Audit logging

You already have:

```text
audit_logs
```

Production MVP should record important actions such as:

```text
message_received
customer_fact_extracted
customer_fact_saved
knowledge_retrieved
quote_requested
appointment_requested
handoff_created
ai_response_generated
message_sent
```

This becomes extremely valuable when a customer asks:

> "Why did the assistant tell them that?"

---

# 16. Error handling

This is one of the biggest differences between a prototype and an MVP.

Every important workflow needs failure handling.

For example:

```text
Postgres failure
      ↓
Don't send misleading response
      ↓
Log error
      ↓
Human fallback
```

Similarly:

```text
AI extraction failure
      ↓
Don't save bad facts
      ↓
Continue safely / escalate
```

And:

```text
WAHA send failure
      ↓
Record failed message
      ↓
Retry / flag
```

The system should fail **safely**, not silently.

---

# 17. Regression testing

This is where we prove the system works.

We need a fixed test suite of conversations.

### Customer identity

```text
"My name is Leroy."
```

Expected:

```text
customer_name = Leroy
```

### Service

```text
"I need a general construction consultation."
```

Expected:

```text
service_interest = General Construction Consultation
```

### Budget

```text
"My budget is JMD 20,000."
```

Expected:

```text
budget = JMD 20,000
```

**Not JMD 20.**

### Combined request

```text
"My name is Leroy. I need a general construction consultation for my house in Kingston. My budget is JMD 200,000."
```

All appropriate facts should be extracted.

### No hallucination

```text
"How much does a general construction project cost?"
```

Expected:

> No invented price.

### Address conflict

```text
"Where is your office?"
```

Expected:

> Explain that the available website information contains conflicting addresses and offer human assistance.

### Unknown service

```text
"Do you install elevators?"
```

Expected:

> The assistant does not claim that Garco provides elevator installation.

### Human request

```text
"Let me speak to someone."
```

Expected:

```text
handoff created
```

### Appointment

```text
"Can someone visit my property next Tuesday?"
```

Expected:

```text
appointment workflow
```

not an invented confirmation.

---

# 18. WhatsApp end-to-end test

After the individual workflows pass:

```text
Real WhatsApp
     ↓
WAHA
     ↓
Workflow 1
     ↓
Workflow 2
     ↓
Workflow 3
     ↓
PostgreSQL
     ↓
AI
     ↓
WAHA
     ↓
Real WhatsApp
```

We need to conduct complete conversations rather than merely executing individual n8n nodes.

---

# 19. Frontend

**Frontend comes last.**

Do not spend weeks building a dashboard before the engine works.

The MVP frontend only needs to expose enough information for the business owner/operator to see:

```text
Conversations
Customers
Lead stage
Latest messages
Customer facts
Quotes
Appointments
Handoffs
```

A simple operational dashboard is enough.

It doesn't need to be a full CRM.

---

# 20. Multi-business configuration

This is critical for your eventual MSP product.

We need to ensure the engine doesn't contain Garco-specific logic such as:

```text
IF Garco
```

Instead:

```text
business_id
     ↓
Business configuration
     ├── Knowledge
     ├── Products
     ├── Rules
     ├── Prompts
     ├── Settings
     └── Contact information
```

Then:

```text
Garco → business_id = 1
Pharmacy → business_id = 2
Hardware → business_id = 3
```

The workflows remain the same.

This is the difference between:

> **building a Garco bot**

and:

> **building a WhatsApp Sales Engine that happens to be configured for Garco.**

---

# 21. Deployment / production hardening

Before calling it production-ready, we also need:

### Docker

Document the complete stack:

```text
n8n
WAHA
PostgreSQL
Redis

```

with persistent volumes.

### Environment variables

No passwords, API keys or secrets hard-coded into workflows.

### Database

Reliable backup/restore procedure.

### Workflows

Exported and version-controlled.

### Business data

Separate from the reusable engine.

### Logs

Errors identifiable without manually digging through every execution.

### Recovery

Know how to restore the system on another computer.

This is particularly important because your eventual product is intended to be installed for different customers.

---

# 22. Documentation

We need four simple documents.

### `README.md`

What the system is and how to start it.

### `ARCHITECTURE.md`

How:

```text
Workflow 1
Workflow 2
Workflow 3
Core Workflows
PostgreSQL
Business configuration
```

fit together.

### `DEPLOYMENT.md`

How to install the system on another machine.

### `BUSINESS_SETUP.md`

How to turn the engine into:

```text
Garco
Pharmacy
Hardware company
```

without modifying the core workflows.

---

# 23. The actual order we should follow

This is the part I would keep beside you while building.

## PHASE 1 — Customer Facts

**We are here.**

```text
☐ Information Extractor
☐ Validate Customer Facts
☐ Prepare Facts
☐ Save Customer Facts
☐ Fix budget extraction
☐ Verify UPSERT
☐ Regression test
```

---

## PHASE 2 — Memory & Context

```text
☐ Finalize Workflow 3
☐ Get contact
☐ Get conversation
☐ Get recent messages
☐ Get customer facts
☐ Get conversation summary
☐ Get knowledge
☐ Get products
☐ Get quotes
☐ Get appointments
☐ Get handoff
☐ BUILD CONTEXT
☐ Return context to Workflow 2
```

---

## PHASE 3 — Knowledge Base

```text
☐ Load Garco authoritative document
☐ Chunk/index it
☐ Verify retrieval
☐ Test factual questions
☐ Test unknown information
☐ Test hallucination prevention
```

---

## PHASE 4 — Quote

```text
☐ Quote retrieval
☐ Quote creation path
☐ Quote rules
☐ Human approval where required
☐ Quote response
```

---

## PHASE 5 — Appointment

```text
☐ Appointment context
☐ Availability check
☐ Booking
☐ Confirmation
☐ No invented availability
```

---

## PHASE 6 — Handoff

```text
☐ Handoff tool
☐ Handoff record
☐ Reason
☐ Notes
☐ Assignment
☐ Human queue
```

---

## PHASE 7 — AI Brain

Only now polish:

```text
☐ System prompt
☐ Sales behavior
☐ Qualification behavior
☐ Knowledge rules
☐ Customer-fact rules
☐ Tool selection
☐ Handoff rules
☐ Response style
```

---

## PHASE 8 — Regression testing

```text
☐ Identity
☐ Service
☐ Budget
☐ Location
☐ Multiple facts
☐ Returning customer
☐ Unknown service
☐ Unknown price
☐ Conflicting address
☐ Appointment
☐ Quote
☐ Handoff
☐ Error handling
☐ WhatsApp end-to-end
```

---

## PHASE 9 — Frontend

```text
☐ Conversation dashboard
☐ Customer view
☐ Facts
☐ Quotes
☐ Appointments
☐ Handoffs
☐ Basic status/lead information
```

---

## PHASE 10 — Production packaging

```text
☐ Docker Compose
☐ Environment configuration
☐ Secrets
☐ Database backup
☐ Workflow exports
☐ Business configuration
☐ Installation documentation
☐ Recovery procedure
☐ Final end-to-end test
```

---

# The MVP finish line

I would call your system **MVP-ready** when you can take a fresh Garco installation and demonstrate this:

> Customer sends a WhatsApp message.

The system:

**receives → identifies → remembers → extracts → validates → retrieves business knowledge → reasons → qualifies → uses tools → responds → stores everything → escalates when necessary.**

And then you can take essentially the **same engine** and configure:

```text
Garco Construction
```

as:

```text
Business A
```

and a:

```text
Pharmacy
```

as:

```text
Business B
```

without rebuilding the workflows.

### Where you actually are

I'd characterize the project as:

```text
                    CURRENT
                       │
Infrastructure ────────██████████  DONE
Database ──────────────██████████  DONE
WAHA/Intake ───────────████████░░  NEAR DONE
Architecture ──────────█████████░  DEFINED
Customer Facts ────────██████░░░░  ← WE ARE HERE
Memory/Context ────────████░░░░░░
Knowledge ─────────────███░░░░░░░
Quotes ────────────────██░░░░░░░░
Appointments ──────────██░░░░░░░░
Handoff ───────────────███░░░░░░░
AI Prompt ─────────────███░░░░░░░
Regression ────────────█░░░░░░░░░
Frontend ──────────────█░░░░░░░░░
Production Packaging ──██░░░░░░░░
```

So **we are not starting over**. The foundation is substantially built.

The immediate objective remains very narrow:

> **Finish Customer Facts completely, test it, and only then move to Memory & Context.**

That will stop the project from feeling like we're jumping between pieces. From this point forward, we should work **top-to-bottom through the nine MVP stages**, and only move to the next stage when the current one passes its definition-of-done tests.
