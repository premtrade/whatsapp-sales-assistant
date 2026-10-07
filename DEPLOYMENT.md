# Deployment Guide — Vercel (Frontend) + DigitalOcean App Platform (Backend)

Architecture:
- **Vercel** hosts the static React/Vite SPA (`frontend/`). API calls go to `/api/*`
  and are rewritten by `frontend/vercel.json` to the backend origin.
- **DigitalOcean App Platform** runs the Express API (`backend/`) in Docker
  (`backend/Dockerfile`, listens on `$BACKEND_PORT`, default 4000).
- **DigitalOcean Managed PostgreSQL** holds application data + migrations
  (`database/migrations/`).

---

## 1. Backend → DigitalOcean App Platform

1. Create a **Managed Database (PostgreSQL)** in the same region as the app.
   - Allow trusted sources: your dev IP while running migrations.
2. Push this repo to GitHub and connect it in DO App Platform
   ("Deploy from GitHub repo"), selecting:
   - **Repository root**: `/workspace`
   - **Dockerfile path**: `backend/Dockerfile`
   - **App type**: Docker (the platform auto-detects via healthcheck below)
3. Add environment variables (App → Resources → Environment variables).
   Copy from `backend/.env.example`. Required at minimum:
   - `NODE_ENV=production`
   - `DATABASE_URL` (use the *internal* connection string from the managed DB)
   - `POSTGRES_*` values if not using DATABASE_URL
   - `JWT_SECRET` (>=32 chars), `JWT_REFRESH_SECRET`
   - `INTERNAL_API_KEY` (shared secret for n8n AI-pipeline endpoints under `/api/internal/*`)
   - `WAHA_*`, `N8N_*`, `GEMINI_API_KEY` etc. per `.env.example`
   - `CORS_ORIGINS=https://<your-vercel-app>.vercel.app,https://<custom-domain>`
     (must include every frontend origin, or browser requests will be blocked)
4. Health check: `/health` (already exposed by `src/app.ts`), initial delay 15s.
5. Instance size: **Basic $6/mo (512MB)** is fine for beta; scale up when WAHA
   webhooks + LLM traffic grow.
6. Run database migrations once against the managed DB:
   ```bash
   cd backend && npm ci
   PGPASSWORD=... psql "$DATABASE_URL" -f ../database/migrations/049_plans_subscriptions_entitlements.sql
   PGPASSWORD=... psql "$DATABASE_URL" -f ../database/migrations/050_ai_usage_metering.sql
   # ...or apply all pending files in order:
   for f in ../database/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```
7. Note the public URL, e.g. `https://waflo-api-<hash>.ondigitalo.app`.

## 2. Frontend → Vercel

1. Import the GitHub repo into Vercel. Set:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` · **Output**: `dist` (already in `frontend/vercel.json`)
2. Update the API rewrite in `frontend/vercel.json`:
   replace `http://206.189.179.60` with the DigitalOcean backend URL from step 1.7
   (use `https://`). Rewrites keep same-origin cookies/CORS simple.
   Alternatively set env var `VITE_API_URL` to the full backend `/api` URL and
   remove the rewrite (requires CORS_ORIGINS to match exactly).
3. Deploy. Verify: open the site, sign up (`/signup`), and confirm network calls
   to `/api/auth/signup` return 200/201.

## 3. Post-deploy smoke test

```bash
curl https://<backend-url>/health
curl -X POST https://<backend-url>/api/signup -H 'Content-Type: application/json' \
  -d '{"email":"beta-smoke@example.com","password":"SmokeTest!123","fullName":"Smoke Test","businessName":"Smoke Co"}'
curl https://<backend-url>/api/subscription/current -H "Authorization: Bearer <token>"
```

## 4. Rollback / kill-switch

- Feature flags live in the DB (`feature_flags` table, migration 049). Flip
  `beta_signup_enabled = false` to stop new trials instantly without redeploying:
  ```sql
  UPDATE feature_flags SET enabled = false WHERE flag_key = 'beta_signup_enabled';
  ```
- Vercel: roll back to previous deployment from the dashboard.
- DO App Platform: "Old Versions" tab → promote prior successful version.
