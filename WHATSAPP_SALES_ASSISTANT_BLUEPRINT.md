# WhatsApp Sales Assistant – Workflow Blueprint

See architecture and workflow summary.

## Workflow 1
Webhook -> Supported Event Filter -> Incoming Message Filter -> Status/Broadcast Filter -> Normalize Payload -> Upsert Contact -> Upsert Conversation -> Insert Customer Message -> Execute Workflow 2 -> Respond to Webhook.

## Workflow 2
When Executed by Another Workflow -> AI Agent (Groq) -> Insert AI Message -> WAHA Send Message -> Audit Log -> Return.

## Inputs
conversation_id, contact_id, phone, customer_name, message, message_id, hasMedia, timestamp.

## WAHA Send
POST /api/sendText with session='default', chatId, text and X-Api-Key.

## Database
contacts -> conversations -> messages.

## Remaining
Audit log, vector search/Qdrant, human handoff, appointments, quotes, dashboard.

Absolutely. At this point, we need to stop thinking in terms of "Workflow 1" and "Workflow 2" and start thinking like software architects. The WhatsApp Sales Assistant is becoming a distributed application with n8n as the orchestration engine.

Below is the blueprint I recommend we treat as the **authoritative design document** going forward.

---

# WhatsApp Sales Assistant

## System Blueprint v1.0

---

# 1. High-Level Architecture

```text
                    ┌───────────────────────────┐
                    │       Customer            │
                    │       WhatsApp            │
                    └─────────────┬─────────────┘
                                  │
                                  │
                         WhatsApp Cloud/Web
                                  │
                                  │
                         WAHA (Chrome Engine)
                                  │
                     Incoming Webhook Events
                                  │
                                  ▼
                  ┌─────────────────────────┐
                  │ Workflow 1              │
                  │ Message Intake          │
                  └─────────────┬───────────┘
                                │
               Stores customer, conversation,
                messages and launches AI Brain
                                │
                                ▼
                  ┌─────────────────────────┐
                  │ Workflow 2              │
                  │ AI Brain                │
                  └─────────────┬───────────┘
                                │
                     Retrieves Context
                                │
             PostgreSQL + Qdrant + Knowledge Base
                                │
                                ▼
                        Groq / LLM
                                │
                                ▼
                    AI Response Generated
                                │
                                ▼
               Save AI Response to PostgreSQL
                                │
                                ▼
                    WAHA Send Message
                                │
                                ▼
                       Customer receives reply
```

---

# 2. Technology Stack

## Messaging

WAHA (Chrome)

Purpose

Receive WhatsApp messages

Send WhatsApp replies

Media download

Session management

---

## Orchestration

n8n

Purpose

Entire application workflow engine

Business logic

Automation

Scheduling

Routing

---

## Database

PostgreSQL

Stores

Contacts

Conversations

Messages

Products

Quotes

Appointments

Knowledge metadata

Audit logs

Settings

Staff

---

## Vector Database

Qdrant

Stores

Document embeddings

Product embeddings

FAQ embeddings

Company knowledge

---

## AI

Groq

Currently

LLM

Later

Reasoning

Classification

Intent detection

Tool calling

---

## Knowledge

Flowise

Purpose

RAG

Conversation memory

Knowledge search

Agent orchestration

---

# 3. Database

Current Tables

```
contacts

conversations

messages

products

quotes

quote_items

appointments

knowledge_documents

knowledge_chunks

handoffs

audit_logs

settings

staff_users
```

---

Relationships

```
CONTACT
   │
   ▼
CONVERSATION
   │
   ▼
MESSAGES

```

Every message belongs to exactly one conversation.

Every conversation belongs to one contact.

---

# 4. Workflow 1

## Incoming Message Pipeline

Purpose

Receive WhatsApp events.

Validate.

Persist.

Launch AI.

---

Node 1

Webhook

Receives

```
message.any
```

Returns

HTTP 200

---

Node 2

Normalize Payload

Creates standardized JSON

```
phone

message

message_id

customer_name

timestamp

fromMe

hasMedia

source

event
```

Everything downstream uses this schema.

---

Node 3

Supported Event Filter

Accept

```
message.any
```

Reject

Everything else.

Examples

```
session.status

message.ack

group.join

presence

typing
```

Rejected events

↓

Respond to Webhook

Done.

---

Node 4

Incoming Message Filter

Accept only

```
fromMe == false
```

Reject

Our own outgoing messages.

---

Node 5

Status Filter

Reject

```
status@broadcast
```

Reject

Status updates

Stories

Viewed status

etc.

---

Node 6

Upsert Contact

Find

Phone

Else

Create contact

Returns

```
contact_id
```

---

Node 7

Upsert Conversation

Open conversation

Else

Create conversation

Returns

```
conversation_id
```

---

Node 8

Insert Customer Message

Insert

```
direction = incoming

sender_type = customer

message_type = text

text_body

metadata
```

Returns

```
message_id
```

---

Node 9

Execute Workflow

Launches

Workflow 2

Passes

```
conversation_id

contact_id

phone

customer_name

message

message_id

timestamp

hasMedia
```

---

Node 10

Respond to Webhook

```
{
"status":"received"
}
```

Nothing else.

---

# Workflow 1 Diagram

```
Webhook

↓

Normalize Payload

↓

Supported Event?

↓

Incoming Message?

↓

Status?

↓

Upsert Contact

↓

Upsert Conversation

↓

Insert Customer Message

↓

Execute Workflow 2

↓

Respond to Webhook
```

---

# 5. Workflow 2

## AI Brain

Purpose

Receive customer message.

Understand.

Retrieve context.

Generate reply.

Save reply.

Send reply.

---

Node 1

When Executed by Another Workflow

Receives

```
conversation_id

contact_id

phone

customer_name

message

message_id

timestamp

hasMedia
```

---

Node 2

Conversation Loader

(Postgres)

Loads

Conversation history

Last 20 messages

---

Node 3

Customer Loader

(Postgres)

Loads

Customer profile

---

Node 4

Knowledge Search

(Current)

Placeholder

Future

Qdrant search

---

Node 5

AI Agent

Input

```
Customer message

Conversation history

Knowledge

Customer profile
```

Output

```
Plain text
```

---

Node 6

Insert AI Message

Insert

```
direction = outgoing

sender_type = ai

message_type = text

text_body

metadata
```

Returns

AI message id

---

Node 7

Audit Log

Insert

```
entity_type

entity_id

action

description

metadata
```

---

Node 8

WAHA Send Message

POST

```
/api/sendText
```

Body

```
session

chatId

text
```

---

Workflow 2

```
Trigger

↓

Load History

↓

Load Customer

↓

Knowledge Search

↓

AI Agent

↓

Insert AI Message

↓

Audit Log

↓

WAHA Send Message
```

---

# 6. Workflow 3 (Planned)

## Human Handoff

AI confidence

↓

Low

↓

Assign staff

↓

Notify staff

↓

Pause AI

---

# 7. Workflow 4 (Planned)

## Product & Quote Engine

Customer

↓

Interested

↓

Retrieve products

↓

Generate quote

↓

Store quote

↓

Send PDF

---

# 8. Workflow 5 (Planned)

## Appointment Booking

Customer requests appointment

↓

Calendar

↓

Availability

↓

Reserve slot

↓

Confirmation

---

# 9. Workflow 6 (Planned)

## Memory Builder

Nightly

↓

Read conversations

↓

Summarize

↓

Generate embeddings

↓

Store in Qdrant

---

# 10. Workflow 7 (Planned)

## Analytics

Daily

↓

Sales

↓

Messages

↓

Conversions

↓

Dashboard

---

# 11. Guiding Principles

This is the architecture we should adhere to as we build:

1. **Workflow 1 is stateless and fast.** It receives, validates, stores, and hands off. It should never perform heavy AI work.
2. **Workflow 2 owns all AI reasoning.** Every LLM interaction, context lookup, and response generation happens here.
3. **PostgreSQL is the source of truth.** Every customer interaction—both inbound and outbound—is persisted before we rely on it.
4. **Qdrant is the knowledge layer.** It complements PostgreSQL by storing embeddings for semantic retrieval, not transactional data.
5. **WAHA is the transport layer only.** It sends and receives WhatsApp messages but contains no business logic.
6. **Every significant action is auditable.** Customer messages, AI responses, handoffs, quotes, and appointments should all be traceable through `audit_logs`.
7. **Workflows should be modular.** New capabilities (quotes, bookings, CRM integrations, voice notes, image understanding, etc.) should plug into this architecture rather than requiring major rewrites.

---

This blueprint should serve as our baseline. As we add features, we'll version it (v1.1, v1.2, etc.) so the architecture stays consistent and the implementation remains manageable.
