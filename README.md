# WhatsApp Sales Assistant

An AI-powered WhatsApp sales assistant that automates customer interactions, lead qualification, and sales workflows.

## Overview

This project combines WhatsApp messaging automation with AI-driven conversation management to streamline sales processes. It leverages n8n for workflow orchestration, Flowise for AI agent building, and a vector database (Qdrant) for semantic search and context retrieval.

## Tech Stack

- **WhatsApp Integration:** WAHA (WhatsApp HTTP API)
- **Workflow Automation:** n8n
- **AI Agents:** Flowise
- **Database:** PostgreSQL
- **Vector Database:** Qdrant
- **Cache/Queue:** Redis
- **Reverse Proxy:** Traefik
- **Database Management:** pgAdmin

## Project Structure

```
whatsapp-sales-assistant/
├── docker/          # Docker configurations for each service
├── database/        # Database migrations, seeds, and schemas
├── workflows/       # n8n workflow definitions
├── flowise/         # Flowise chatflows and agent configurations
├── frontend/        # Frontend application
├── backend/         # Backend API services
├── scripts/         # Utility and setup scripts
├── docs/            # Project documentation
├── assets/          # Static assets (images, templates, etc.)
├── tests/           # Test suites
├── backups/         # Database and configuration backups
└── .github/         # GitHub workflows and templates
```

## Getting Started

### Prerequisites

- Docker
- Docker Compose
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd whatsapp-sales-assistant
   ```

2. Copy the environment example file and configure your settings:
   ```bash
   cp .env.example .env
   ```

3. Start the services with Docker Compose:
   ```bash
   docker compose up -d
   ```

## Documentation

Detailed documentation can be found in the [`docs/`](./docs) directory.

## License

This project is proprietary. All rights reserved.