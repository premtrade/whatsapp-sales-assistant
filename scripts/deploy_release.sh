#!/usr/bin/env bash
# Mirror of the CI "Deploy via SSH" script (see .github/workflows/ci.yml) so a
# release can be shipped to production without waiting for GitHub Actions.
# Usage: DEPLOY_PATH=/root/whatsapp-sales-assistant EXPECTED_SHA=<sha> bash deploy_release.sh
set -Eeuo pipefail

# Only one deploy may run at a time: two overlapping deploys recreate the
# same containers and collide on the compose helper container names.
LOCK_FILE="${DEPLOY_LOCK_FILE:-/root/.waflo-deploy.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy is already running (lock: $LOCK_FILE)" >&2
  exit 1
fi

DEPLOY_PATH="${DEPLOY_PATH:-/root/whatsapp-sales-assistant}"
EXPECTED_SHA="${EXPECTED_SHA:?EXPECTED_SHA is required}"

case "$DEPLOY_PATH" in
  /*) ;;
  *) echo "DEPLOY_PATH must be an absolute path" >&2; exit 1 ;;
esac
test -d "$DEPLOY_PATH/.git"
test -s "$DEPLOY_PATH/.env"

echo "==> Fetching release commit without changing the server checkout..."
git -C "$DEPLOY_PATH" fetch --no-tags origin main
FETCHED_SHA="$(git -C "$DEPLOY_PATH" rev-parse FETCH_HEAD)"
git -C "$DEPLOY_PATH" merge-base --is-ancestor "$EXPECTED_SHA" "$FETCHED_SHA"

RELEASES_DIR="$(dirname "$DEPLOY_PATH")/waflo-releases"
RELEASE_PATH="$RELEASES_DIR/$EXPECTED_SHA"
mkdir -p "$RELEASES_DIR"
chmod 700 "$RELEASES_DIR"

if [ -e "$RELEASE_PATH" ]; then
  test "$(cat "$RELEASE_PATH/.release-sha")" = "$EXPECTED_SHA"
else
  STAGING_PATH="$(mktemp -d "$RELEASES_DIR/.incoming-${EXPECTED_SHA}.XXXXXX")"
  git -C "$DEPLOY_PATH" archive --format=tar "$EXPECTED_SHA" | tar -xf - -C "$STAGING_PATH"
  printf '%s\n' "$EXPECTED_SHA" > "$STAGING_PATH/.release-sha"
  mv "$STAGING_PATH" "$RELEASE_PATH"
fi

if [ ! -e "$RELEASE_PATH/.env" ]; then
  ln -s "$DEPLOY_PATH/.env" "$RELEASE_PATH/.env"
fi

cd "$RELEASE_PATH"
compose() {
  env -u POSTGRES_USER -u POSTGRES_DB -u POSTGRES_PASSWORD -u BACKEND_PORT \
  docker compose -p whatsapp-sales-assistant \
    --project-directory "$RELEASE_PATH" \
    --env-file "$DEPLOY_PATH/.env" \
    -f "$RELEASE_PATH/docker-compose.yml" \
    -f "$RELEASE_PATH/docker-compose.prod.yml" "$@"
}

echo "==> Validating production Compose configuration..."
COMPOSE_CONFIG="$(compose config --format json)"
POSTGRES_USER="$(printf '%s' "$COMPOSE_CONFIG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["postgres"]["environment"]["POSTGRES_USER"])')"
POSTGRES_DB="$(printf '%s' "$COMPOSE_CONFIG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["postgres"]["environment"]["POSTGRES_DB"])')"
POSTGRES_PASSWORD="$(printf '%s' "$COMPOSE_CONFIG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"])')"
BACKEND_PORT="$(printf '%s' "$COMPOSE_CONFIG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["backend"]["environment"].get("BACKEND_PORT", 4000))')"
JWT_SECRET_CHECK="$(printf '%s' "$COMPOSE_CONFIG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["backend"]["environment"].get("JWT_SECRET") or "")')"
unset COMPOSE_CONFIG
test -n "$POSTGRES_USER"
test -n "$POSTGRES_DB"
test -n "$POSTGRES_PASSWORD"
test -n "$BACKEND_PORT"
if [ -z "$JWT_SECRET_CHECK" ]; then
  echo "Refusing to deploy: JWT_SECRET resolves to empty in the backend service" >&2
  exit 1
fi
unset JWT_SECRET_CHECK
export POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD BACKEND_PORT

echo "==> Backing up PostgreSQL databases before deployment..."
BACKUP_DIR="$(dirname "$DEPLOY_PATH")/waflo-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/postgres-${EXPECTED_SHA}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
if [ -e "$BACKUP_FILE" ]; then
  echo "Backup already exists: $BACKUP_FILE" >&2
  exit 1
fi
compose exec -T -e "PGPASSWORD=$POSTGRES_PASSWORD" postgres pg_dumpall -U "$POSTGRES_USER" | gzip > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
test -s "$BACKUP_FILE"

echo "==> Cleaning up stale compose helper containers..."
# A failed/partial recreate leaves a container named "/<hash>_<service>"
# behind, and the next recreate then fails with 'the container name
# "/<hash>_postgres" is already in use'.
for stale in $(docker ps -a --format '{{.Names}}' | grep -E '^[0-9a-f]{12}_' || true); do
  echo "Removing stale helper container: $stale"
  docker rm -f "$stale" >/dev/null || true
done

echo "==> Pulling the CI-built images and updating the application containers..."
# Use the images CI already built, tested and pushed to GHCR instead of
# rebuilding on the host. Rebuilding here meant npm ci, tsc, a HuggingFace
# model download and two Vite builds on every deploy, which overran the SSH
# command timeout and left 15 GB of build cache on a 48 GB disk.
SHORT_SHA="$(printf '%s' "$EXPECTED_SHA" | cut -c1-7)"
export BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/premtrade/whatsapp-sales-assistant-backend:sha-${SHORT_SHA}}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE:-ghcr.io/premtrade/whatsapp-sales-assistant-frontend:sha-${SHORT_SHA}}"
echo "    backend image:  $BACKEND_IMAGE"
echo "    frontend image: $FRONTEND_IMAGE"
compose pull backend frontend
compose up -d --remove-orphans

echo "==> Reclaiming unused Docker build cache..."
docker builder prune -af --filter "until=168h" || true

echo "==> Waiting for backend health..."
HEALTHY=0
for attempt in $(seq 1 24); do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null; then
    HEALTHY=1
    break
  fi
  sleep 5
done
if [ "$HEALTHY" -ne 1 ]; then
  compose ps
  echo "Backend health check failed" >&2
  exit 1
fi

echo "==> Running pending database migrations..."
COMPOSE_PROJECT_NAME=whatsapp-sales-assistant \
  COMPOSE_FILE="$RELEASE_PATH/docker-compose.yml:$RELEASE_PATH/docker-compose.prod.yml" \
POSTGRES_HOST=127.0.0.1 \
  POSTGRES_PORT="$(compose port postgres 5432 | sed 's/.*://')" \
  POSTGRES_USER="$POSTGRES_USER" \
  POSTGRES_DB="$POSTGRES_DB" \
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  bash "$RELEASE_PATH/scripts/run-migrations.sh"

echo "==> Reloading nginx..."
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "==> Final health check..."
curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health"
compose ps
echo "==> Deployed release $EXPECTED_SHA"
