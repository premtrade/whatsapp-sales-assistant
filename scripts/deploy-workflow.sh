#!/usr/bin/env bash
# Deploy a workflow from the repo into the live n8n instance.
#
#   scripts/deploy-workflow.sh "09 - Appointment Reminders"
#
# n8n 2.x keeps a draft in workflow_entity and the definition that actually
# runs in workflow_history, keyed by the workflow's activeVersionId. Editing
# workflow_entity alone changes nothing at runtime, and n8n writes its in-memory
# copy back to the database on shutdown, so a restart can undo the change.
#
# The deployment therefore stops n8n, writes a new version, points the active
# and published version ids at it, and starts n8n again.
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
import json, os, subprocess, uuid
from datetime import datetime, timezone

deploy_path = os.environ['DEPLOY_PATH']
name = os.environ['WORKFLOW_NAME']
workflows_dir = os.environ['WORKFLOWS_DIR']
db = os.environ.get('N8N_DB', 'n8n')
user = os.environ['POSTGRES_USER']
password = os.environ['POSTGRES_PASSWORD']


def psql(sql):
    out = subprocess.run(
        ['docker', 'exec', '-i', '-e', 'PGPASSWORD=%s' % password, 'postgres',
         'psql', '-U', user, '-d', db, '-tAF', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit('psql failed: ' + out.stderr.strip()[:500])
    return out.stdout


# --- stop n8n first: it writes its in-memory workflows back on shutdown ----
print('stopping n8n so it cannot overwrite the change on shutdown')
subprocess.run(
    ['docker', 'compose', '-p', 'whatsapp-sales-assistant',
     '--project-directory', deploy_path,
     '--env-file', os.path.join(deploy_path, '.env'),
     '-f', os.path.join(deploy_path, 'docker-compose.yml'),
     '-f', os.path.join(deploy_path, 'docker-compose.prod.yml'),
     'stop', 'n8n'],
    check=True, capture_output=True, text=True)

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

rows = psql("SELECT id FROM workflow_entity WHERE name = '%s';" % name.replace("'", "''")).split()
if not rows:
    raise SystemExit('no live workflow named %r' % name)
workflow_id = rows[0].strip()
print('workflow id:', workflow_id)

nodes = json.dumps(wf['nodes']).replace("'", "''")
connections = json.dumps(wf['connections']).replace("'", "''")
settings = json.dumps(wf.get('settings', {})).replace("'", "''")
node_groups = json.dumps(wf.get('nodeGroups', {})).replace("'", "''")
version_id = str(uuid.uuid4())
now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')

# The running definition is the version in workflow_history that
# activeVersionId points at, so a new version has to be created and the
# workflow has to be pointed at it.
psql(
    "INSERT INTO workflow_history "
    "(\"versionId\", \"workflowId\", authors, \"createdAt\", \"updatedAt\", nodes, connections, name, autosaved, description, \"nodeGroups\") "
    "VALUES ('%s', '%s', 'waflo-deploy', NOW(), NOW(), '%s'::json, '%s'::json, '%s', FALSE, NULL, '%s'::json);"
    % (version_id, workflow_id, nodes, connections, name.replace("'", "''"), node_groups)
)

psql(
    "UPDATE workflow_entity SET nodes='%s'::json, connections='%s'::json, settings='%s'::json, "
    "\"versionId\"='%s', \"activeVersionId\"='%s', \"versionCounter\"=COALESCE(\"versionCounter\",0)+1, \"updatedAt\"=NOW() "
    "WHERE id='%s';" % (nodes, connections, settings, version_id, version_id, workflow_id)
)

psql(
    "DELETE FROM workflow_published_version WHERE \"workflowId\"='%s';" % workflow_id
)
psql(
    "INSERT INTO workflow_published_version (\"workflowId\", \"publishedVersionId\", \"createdAt\", \"updatedAt\") "
    "VALUES ('%s', '%s', NOW(), NOW());" % (workflow_id, version_id)
)

print('new version:', version_id)
print('after update -> active/length:', psql(
    "SELECT \"activeVersionId\", length(nodes::text) FROM workflow_entity WHERE id='%s';" % workflow_id).strip())
PY

echo "--- starting n8n so it loads the published version ---"
compose() {
  env -u POSTGRES_USER -u POSTGRES_DB -u POSTGRES_PASSWORD -u BACKEND_PORT \
  docker compose -p whatsapp-sales-assistant --project-directory "$DEPLOY_PATH" \
    --env-file "$DEPLOY_PATH/.env" \
    -f "$DEPLOY_PATH/docker-compose.yml" -f "$DEPLOY_PATH/docker-compose.prod.yml" "$@"
}
compose start n8n >/dev/null

for i in $(seq 1 45); do
  if curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:5678/healthz 2>/dev/null \
     || curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:5678/ 2>/dev/null; then
    echo "    n8n back after $((i * 2))s"
    break
  fi
  sleep 2
done

echo "--- verifying the published version carries the fix ---"
compose exec -T -e "PGPASSWORD=$POSTGRES_PASSWORD" postgres psql -U "$POSTGRES_USER" -d "${N8N_DB:-n8n}" -tAc \
  "SELECT CASE WHEN h.nodes::text LIKE '%business_timezone%' AND h.nodes::text LIKE '%marked AS%'
                 THEN 'the running version has the fix'
                 ELSE 'STILL MISSING' END
     FROM workflow_history h
     JOIN workflow_entity w ON w.\"activeVersionId\" = h.\"versionId\"
    WHERE w.id = (SELECT id FROM workflow_entity WHERE name = '$NAME');" | sed 's/^/    /'
