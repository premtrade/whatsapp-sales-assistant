#!/usr/bin/env bash
# Deploy a workflow from the repo into the live n8n instance.
#
#   scripts/deploy-workflow.sh "09 - Appointment Reminders"
#
# n8n keeps workflows in its own database and nothing in the deploy pipeline
# pushed them there, so the repo's workflow files and the live instance drifted
# apart silently and a fix to a workflow could not be shipped. This syncs the
# node definitions, connections and settings for one workflow, matched by
# name, then restarts n8n so it reloads the active workflow.
#
# Only nodes, connections and settings are copied. The workflow id, the active
# flag, credentials and pinned data are left alone.
set -Eeuo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: $0 <workflow name>" >&2
  exit 1
fi

DEPLOY_PATH="${DEPLOY_PATH:-/root/whatsapp-sales-assistant}"
cd "$DEPLOY_PATH"
set -a
. ./.env
set +a

export DEPLOY_PATH
export WORKFLOW_NAME="$NAME"
# Where the workflow JSON lives. The server's git checkout is often stale, so
# point this at a release directory to deploy the current commit's workflows.
export WORKFLOWS_DIR="${WORKFLOWS_DIR:-$DEPLOY_PATH/workflows}"

python3 - <<'PY'
import json, os, subprocess

deploy_path = os.environ['DEPLOY_PATH']
name = os.environ['WORKFLOW_NAME']
workflows_dir = os.environ['WORKFLOWS_DIR']
db = os.environ.get('N8N_DB', 'n8n')
user = os.environ['POSTGRES_USER']
password = os.environ['POSTGRES_PASSWORD']

# --- find the repo file for this workflow -----------------------------------
source = None
for entry in sorted(os.listdir(workflows_dir)):
    if not entry.endswith('.json'):
        continue
    path = os.path.join(workflows_dir, entry)
    try:
        data = json.load(open(path))
    except Exception:
        continue
    data = data[0] if isinstance(data, list) else data
    if data.get('name') == name:
        source = path
        break

if not source:
    raise SystemExit('no workflow named %r in %s' % (name, workflows_dir))
print('source:', os.path.join(workflows_dir, os.path.basename(source)))

wf = json.load(open(source))
wf = wf[0] if isinstance(wf, list) else wf


def psql(sql):
    out = subprocess.run(
        ['docker', 'exec', '-i', '-e', 'PGPASSWORD=%s' % password, 'postgres',
         'psql', '-U', user, '-d', db, '-tAF', '|', '-c', sql],
        capture_output=True, text=True, check=True)
    return out.stdout


found = psql("SELECT id FROM workflow_entity WHERE name = '%s'" % name.replace("'", "''")).strip()
if not found:
    raise SystemExit('no live workflow named %r' % name)
wf_id = found.splitlines()[0].strip()
print('live workflow id:', wf_id)


def esc(value):
    return value.replace("'", "''")


sql = (
    "UPDATE workflow_entity SET nodes = '%s'::jsonb, connections = '%s'::jsonb, settings = '%s'::jsonb "
    "WHERE id = '%s'" % (
        esc(json.dumps(wf['nodes'])),
        esc(json.dumps(wf['connections'])),
        esc(json.dumps(wf.get('settings', {}))),
        wf_id,
    )
)
psql(sql)
print('updated nodes, connections and settings')
print('after update -> active/length:', psql(
    "SELECT active, length(nodes::text) FROM workflow_entity WHERE id = '%s'" % wf_id).strip())
PY

echo "--- restarting n8n so it reloads the active workflow ---"
compose() {
  env -u POSTGRES_USER -u POSTGRES_DB -u POSTGRES_PASSWORD -u BACKEND_PORT \
  docker compose -p whatsapp-sales-assistant --project-directory "$DEPLOY_PATH" \
    --env-file "$DEPLOY_PATH/.env" \
    -f "$DEPLOY_PATH/docker-compose.yml" -f "$DEPLOY_PATH/docker-compose.prod.yml" "$@"
}
compose restart n8n >/dev/null

for i in $(seq 1 45); do
  if curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:5678/healthz 2>/dev/null \
     || curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:5678/ 2>/dev/null; then
    echo "    n8n back after $((i * 2))s"
    break
  fi
  sleep 2
done

echo "--- verifying the live workflow now carries the fix ---"
compose exec -T -e "PGPASSWORD=$POSTGRES_PASSWORD" postgres psql -U "$POSTGRES_USER" -d "${N8N_DB:-n8n}" -tAc \
  "SELECT CASE WHEN nodes::text LIKE '%business_timezone%' THEN 'the timezone fix is live' ELSE 'STILL MISSING' END
     FROM workflow_entity WHERE name = '$NAME';" | sed 's/^/    /'
