# Plan: Recover WhatsApp Sales Assistant after Docker reinstall

**Goal:** Get all Docker Compose services (postgres, redis, n8n, waha, backend, frontend, pgadmin) running and healthy again with the existing codebase intact.

## Context
- Codebase is intact; `.env` at repo root is populated with secrets.
- `docker-compose.yml` defines services; backend/frontend use local `build` contexts; volumes are named for persistence.
- Postgres init SQL files and migrations are mounted as `docker-entrypoint-initdb.d`; they run automatically on a fresh data directory.
- n8n workflows can be re-imported from `workflows/*.json` via `scripts/import_workflows.py`.
- The Docker uninstall may have wiped named volumes; we cannot assume data survived.

## Prerequisites
- Docker Desktop is installed, running, and exposes `docker` and `docker compose` CLI.
- `.env` file exists at repo root (it does).

## Steps
1. Verify Docker is healthy:
   ```powershell
   docker version
   docker compose version
   ```
2. Ensure you are in the project root (`C:\Projects\whatsapp-sales-assistant`).
3. **If you have a backup of Docker volume directories (raw volume files) and want to restore them:**
   a. Stop any running containers (including existing ones):
      ```powershell
      docker compose down
      ```
   b. Locate Docker's volume storage root. For Docker Desktop on Windows, this is usually `%USERPROFILE%\.docker\volumes` or can be discovered via:
      ```powershell
      $dockerRoot = docker info --format '{{.DockerRootDir}}'
      ```
   c. Copy the backup volume directories into Docker's storage. Example for `postgres_data`:
      ```powershell
      # Remove any existing volume directory to avoid conflicts
      Remove-Item -Path "$dockerRoot\volumes\data\postgres_data" -Recurse -Force -ErrorAction SilentlyContinue
      # Copy the backup contents (assumes backup root contains a `postgres_data` folder)
      Copy-Item -Path "C:\Users\rolin\Backup\volumes\postgres_data\*" -Destination "$dockerRoot\volumes\data\postgres_data" -Recurse -Force
      ```
      Repeat for `redis_data`, `n8n_data`, `waha_data`, `pgadmin_data`, `backend_data`, `frontend_data`.
   d. Verify that the volume directories exist in Docker's storage.
4. (Optional) Pull base images:
   ```powershell
   docker compose pull
   ```
5. Build and start all services:
   ```powershell
   docker compose up -d
   ```
6. Wait for containers to become healthy and check status:
   ```powershell
   docker compose ps
   docker compose logs --tail=100
   ```
   - If Postgres volume was lost or restored, the init SQL files run automatically on first startup (schema + migrations 022–054).
7. Re-import n8n workflows only if the `n8n_data` volume was lost or workflows are missing:
   ```powershell
   .venv\\Scripts\\Activate.ps1
   pip install -r scripts\\requirements.txt
   $env:N8N_API_KEY = $Env:N8N_API_KEY
   $env:N8N_BASE_URL = "http://localhost:5678"
   python scripts\\import_workflows.py
   ```
   Then open http://localhost:5678 and re-link Postgres/Groq/HuggingFace credentials on each workflow.
8. Verify endpoints:
   - Frontend: http://localhost:3000
   - Backend health: http://localhost:4000/health
   - n8n: http://localhost:5678
   - pgAdmin: http://localhost:5050
   - WAHA dashboard: http://localhost:3001

## Risks / Data note
- Named volumes (`postgres_data`, `n8n_data`, `waha_data`, etc.) will be restored from the backup of Docker volume directories. Ensure the backup matches the exact volume names used by this project (as defined in `docker-compose.yml`).
- If backup is incomplete or corrupted, some data may be missing; the init SQL files will create an empty schema in that case.
- `.env` contains exposed API keys; rotate them if the environment is untrusted (README repo-hygiene notes).

## Acceptance criteria
- All containers `Up` and `healthy`.
- Frontend loads and backend `/health` returns OK.
- n8n workflows are active (if re-imported).
- Database contains expected data (check via pgAdmin).

## Open question (answered)
- Backup format: Docker volume directories (raw volume files). This determines the restore procedure (step 3 above).
