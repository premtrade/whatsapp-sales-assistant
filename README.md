# WhatsApp Sales Assistant

A multi-tenant AI WhatsApp sales assistant: inbound WhatsApp messages are captured, enriched with
conversation/customer memory and knowledge-base context, answered by an LLM agent with tool access
(appointments, quotes, human handoff), and managed through a web dashboard.

## How it works

```
WhatsApp ──> WAHA ──webhook──> n8n (Workflow 01: sanitize/persist)
                                  └─> Workflow 03 Memory & Context Builder (pgvector search)
                                  └─> Workflow 02 AI Brain (Groq chat model + tools 05/06/07)
                                  └─> Workflow 04 Memory Writer, 08 Output Processor
                                          │
                                          ├──> WAHA  (reply to the customer)
                                          └──> PostgreSQL (messages, memory, audit)

Dashboard (React on Vercel) ──HTTP──> Backend API (Fastify) ──> PostgreSQL / Redis
Knowledge uploads ──> Backend API ──> Gemini embeddings ──> pgvector
```

The conversational logic (prompts, tool calling, memory read/write) lives in the **n8n workflows**,
not in the backend. The backend owns authentication, tenancy, CRUD, ingestion and subscriptions.

## Tech Stack

| Concern            | Choice                                                          |
| ------------------ | --------------------------------------------------------------- |
| WhatsApp gateway   | WAHA (WhatsApp HTTP API)                                        |
| Orchestration      | n8n + LangChain nodes (agent, tools, Groq chat model)           |
| Chat LLM           | Groq (`AI_DEFAULT_MODEL`, default `qwen/qwen3.8-27b`)           |
| Embeddings         | Google Gemini `gemini-embedding-001`, 768 dimensions            |
| Vector search      | **pgvector** inside PostgreSQL (Qdrant was removed; see migration `032_pgvector_embeddings.sql`) |
| Database           | PostgreSQL 15 with the `vector` extension                       |
| Cache              | Redis                                                           |
| Backend API        | Node 20 / TypeScript / Fastify                                  |
| Frontend           | React 18 + Vite (deployed to Vercel)                            |
| Containers         | Docker Compose (`docker-compose.yml`, `docker-compose.prod.yml`) |

There is no Traefik in this stack: the frontend is served by Vercel, the backend sits behind nginx on
the Droplet (see `scripts/setup-vps-for-vercel.sh`), and pgAdmin is exposed directly by Compose.

## Project Structure

```
whatsapp-sales-assistant/
├── backend/           # Fastify REST API + WebSocket (TypeScript)
├── frontend/          # React + Vite dashboard (Vercel: vercel.json)
├── workflows/         # n8n workflow JSON — source of truth for the AI pipeline
│   └── live/          # Snapshot exported from the running n8n instance
├── database/
│   ├── schema/        # Clean-install schema
│   └── migrations/    # Incremental migrations (032 = pgvector switch)
├── docker/            # Per-service Docker build context
├── scripts/           # Ops + data utilities (PowerShell, bash, Python)
├── tests/             # Jest API/security/workflow contract tests
├── docs/              # Onboarding, user manual, runbook, deployment guides
└── .github/           # CI workflows and issue/PR templates
```

## Getting Started

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ (local dashboard/API development and tests)
- Python 3.11+ (only for the knowledge/memory embedding helpers:
  `pip install -r scripts/requirements.txt`)

### Install

```bash
git clone <repository-url>
cd whatsapp-sales-assistant
cp .env.example .env        # then fill in secrets: Postgres, JWT, WAHA, n8n, Gemini
docker compose up -d
```

### Endpoints

| Service  | URL                                       |
| -------- | ----------------------------------------- |
| Frontend | http://localhost:3000                     |
| Backend  | http://localhost:4000 (health: `/health`) |
| n8n      | http://localhost:5678                     |
| pgAdmin  | http://localhost:5050                     |

Load the workflows with `python scripts/import_workflows.py`
(see `scripts/import_workflows.README.md`) or import `workflows/*.json` through the n8n UI.

### Local development

```bash
cd backend  && npm ci && npm run dev    # API on :4000
cd frontend && npm ci && npm run dev    # Vite on :3000, proxies /api and /ws to the API
cd backend  && npm run build            # tsc type-check
cd tests    && npm ci && npm test       # jest API / security / contract tests
```


## Model configuration (single source of truth)

These must agree, otherwise the dashboard advertises a model the pipeline does not run:

| Setting            | Where                                                                            | Default                |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------- |
| `AI_DEFAULT_MODEL` | `.env` → backend `config.ai.defaultModel` → seeded into `settings.ai_model`       | `qwen/qwen3.8-27b`     |
| Live agent model   | n8n `Workflow 2 - AI Brain` → Groq Chat Model                                    | `qwen/qwen3.8-27b`     |
| `EMBEDDING_MODEL`  | `.env` → backend `config.ai.embeddingModel` → stored on each `knowledge_chunks`   | `gemini-embedding-001` |
| Offline re-embedding | `scripts/embed_knowledge_hf.py` / `scripts/embed_memory.py` (`HF_EMBED_MODEL`)  | `BAAI/bge-base-en-v1.5` (768 dims) |

`AI_DEFAULT_MODEL` is only written when a business signs up through public onboarding
(`backend/src/services/public.service.ts`); to change the model for a live tenant, edit the n8n node.
`EMBEDDING_MODEL` must not change without re-embedding existing chunks — the pgvector column holds
fixed 768-dimension vectors.

Watch the vector space: `backend/src/services/embedding.ts` writes `knowledge_chunks.embedding` with
Gemini, while `scripts/embed_knowledge_hf.py` rewrites the same column with a Hugging Face model. Both
produce 768 numbers, so Postgres accepts them, but cosine similarity across providers is meaningless —
choose one provider per table and re-embed every row when switching.
`scripts/embed_knowledge_groq.py` is deprecated and refuses to run (its 1536-dim output
does not fit `vector(768)`); see `scripts/requirements.txt` for the Python setup.

## Deployment

- **API + data services:** `docker-compose.prod.yml` on the Droplet, behind nginx
  (`scripts/setup-vps-for-vercel.sh`, `scripts/setup-ssl.sh`, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- **Frontend:** Vercel. `frontend/vercel.json` rewrites `/api`, `/ws` and `/health` to the Droplet so
  the browser only ever talks to the HTTPS Vercel origin (an `http://` API from an `https://` page
  would be blocked as mixed content). `vercel.json` cannot read environment variables, so the Droplet
  address is written literally there — update it there and in `scripts/setup-ssl.sh` when the server moves.

## Documentation

| Document | Purpose |
| -------- | ------- |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Technical setup and architecture walkthrough |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | End-user guide for the dashboard |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment, Vercel + Droplet wiring |
| [docs/runbook.md](docs/runbook.md) | Day-2 operations, migrations, troubleshooting |
| [docs/monitoring.md](docs/monitoring.md), [docs/health-check.md](docs/health-check.md) | Health checks and monitoring |
| [docs/security.md](docs/security.md) | Security policy and controls |
| [workflows/mvp.md](workflows/mvp.md) | Workflow-by-workflow behaviour of the AI pipeline |

## Repository hygiene

Never commit: `.env*` (except `*.example`), `login.json`, `*.bak*`, `scripts/_tmp_*`, ad-hoc
`test_*.js` / `repro.js` scratch files, n8n credential exports, or database dumps — all covered by
`.gitignore`. Anything secret that was already pushed must be **rotated**, not just deleted; the
n8n encryption key and WAHA/JWT secrets belong in the environment, never in git history.

## License

This project is proprietary. All rights reserved.
