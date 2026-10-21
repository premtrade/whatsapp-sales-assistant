/**
 * Repairs the workflows that call the backend or write to constrained
 * columns. The findings came from scripts/audit-workflows.mjs and
 * scripts/audit-backend-calls.mjs.
 *
 * 1. 01, 05 and 06 sent the literal string REPLACE_WITH_N8N_WEBHOOK_SECRET
 *     as the webhook secret. It never matched anything, so every internal
 *     workflow call was rejected. They now read the secret from the
 *     environment, so it never has to live in the repository.
 *
 * 2. 05 and 06 had no HTTP timeout, so a rejected call blocked the workflow
 *     for n8n's default of five minutes.
 *
 * 3. 04 read a contact id and a customer name from a paired item, which
 *     resolves to nothing in a Postgres node. The customer's name was never
 *     written to the contact.
 *
 * 4. 08 and 10 wrote 'system' into audit_logs.performed_by, which is a uuid
 *     column, and 'automation' into performed_by_type, which is not one of the
 *     allowed values (system, ai, staff, customer). Both audit inserts
 *     violated their constraints and would fail the run.
 *
 * 5. 08 and 10 also read their audit ids from a paired item, or from an item
 *     an HTTP request had already replaced. The audit row is now written by
 *     the same statement that writes the message, so it has the ids to hand.
 *
 * 6. 08's delivery marker and output read a paired item, so a follow-up was
 *     never marked delivered and the assistant was told a follow-up went to
 *     "undefined".
 *
 * 7. 05 was saved with a UTF-8 BOM, which n8n may refuse to import.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'workflows');

const changes = [];
const note = (file, what) => changes.push(`${file}: ${what}`);

function load(file) {
  let raw = readFileSync(join(dir, file), 'utf8');
  let hadBom = false;
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
    hadBom = true;
  }
  const parsed = JSON.parse(raw);
  const wf = Array.isArray(parsed) ? parsed[0] : parsed;
  return { wf, hadBom };
}

function save(file, wf, hadBom) {
  const body = JSON.stringify(wf, null, 2) + '\n';
  writeFileSync(join(dir, file), body, 'utf8');
  if (hadBom) note(file, 'removed a UTF-8 BOM');
}

const nodeOf = (wf, name) => wf.nodes.find((n) => n.name === name);

// --- 1 and 2: the webhook secret and the HTTP timeout ----------------------
for (const file of [
  '01 - Incoming WhatsApp Message.json',
  '01 - Incoming WhatsApp Message (FIXED).json',
  '05 - Appointment Tool.json',
  '06 - Quote Tool.json',
]) {
  const { wf, hadBom } = load(file);
  let secretFixed = 0;
  let timeoutAdded = 0;

  for (const node of wf.nodes) {
    if (node.type !== 'n8n-nodes-base.httpRequest') continue;
    if (!/backend:4000/.test(String(node.parameters.url || ''))) continue;

    const headers = node.parameters.headerParameters?.parameters || [];
    for (const header of headers) {
      if (String(header.name).toLowerCase() === 'x-webhook-secret' &&
          String(header.value).includes('REPLACE_WITH')) {
        header.value = '={{ $env.N8N_WEBHOOK_SECRET }}';
        secretFixed++;
      }
    }

    if (!node.parameters.options?.timeout) {
      node.parameters.options = {
        ...(node.parameters.options || {}),
        timeout: 20000,
      };
      timeoutAdded++;
    }
  }

  if (secretFixed) note(file, `read the webhook secret from the environment in ${secretFixed} call(s)`);
  if (timeoutAdded) note(file, `gave ${timeoutAdded} backend call(s) a 20 second timeout`);
  save(file, wf, hadBom);
}

// --- 3: 04 Memory Writer, the paired item references -----------------------
{
  const file = '04 - Memory Writer.json';
  const { wf, hadBom } = load(file);
  let fixed = 0;

  for (const name of ['Save Customer Name', 'Update Contact Name']) {
    const node = nodeOf(wf, name);
    if (!node) continue;
    const options = node.parameters.options || {};
    const before = options.queryReplacement || '';
    const after = before.replace(/\$\('Extract Customer Name'\)\.item\.json/g, "$('Extract Customer Name').first().json");
    if (after !== before) {
      options.queryReplacement = after;
      node.parameters.options = options;
      fixed++;
    }
  }

  if (fixed) note(file, `read the contact id and name from the extracted item in ${fixed} node(s)`);
  save(file, wf, hadBom);
}

// --- 4, 5 and 6: 08 Quote Follow-up Sequences ------------------------------
{
  const file = '08 - Quote Follow-up Sequences.json';
  const { wf, hadBom } = load(file);

  // The insert writes the message, the audit row and the delivery marker in
  // one statement, so every id is already to hand.
  const insert = nodeOf(wf, 'Insert Follow-up Message');
  insert.parameters.query = `
WITH msg AS (
  INSERT INTO messages (business_id, conversation_id, direction, sender_type, message_type, text_body, metadata, created_at, updated_at)
  SELECT NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, 'outgoing', 'staff', 'text', $3,
         COALESCE(NULLIF($4, '')::jsonb, '{}'::jsonb), NOW(), NOW()
  RETURNING id, business_id, conversation_id, text_body, metadata
), audited AS (
  INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, performed_by_type, description, new_values, metadata, business_id)
  SELECT 'quote', NULLIF($5, '')::uuid, 'automated_follow_up', NULL, 'system',
         'Automated ' || $6 || ' follow-up sent for quote ' || $7,
         jsonb_build_object('follow_up_type', $6),
         jsonb_build_object('quote_number', $7, 'contact_id', NULLIF($8, '')::uuid, 'timestamp', NOW()),
         NULLIF($1, '')::uuid
  RETURNING id
)
SELECT msg.id AS id, msg.business_id AS business_id, msg.conversation_id AS conversation_id,
       msg.text_body AS text_body, msg.metadata AS metadata
  FROM msg, audited;
`.trim();

  insert.parameters.options = insert.parameters.options || {
    queryReplacement:
      "={{ [String(($json.business_id) ?? ''), String(($json.conversation_id) ?? ''), String(($json.message) ?? ''), String((JSON.stringify({ follow_up_type: $json.follow_up_type, template_used: $json.template_used, quote_id: $json.id, quote_number: $json.quote_number, contact_id: $json.contact_id, phone: $json.phone, display_name: $json.display_name, waha_session_name: $json.waha_session_name, automated: true })) ?? ''), String(($json.id) ?? ''), String(($json.follow_up_type) ?? ''), String(($json.quote_number) ?? ''), String(($json.contact_id) ?? '')] }}",
  };

  note(file, 'the insert now writes the audit row too, with a valid performed_by_type');

  // The delivery marker and the separate audit node are no longer needed.
  wf.nodes = wf.nodes.filter((n) => n.name !== 'Audit Log' && n.name !== 'Mark Follow-up Delivered');
  delete wf.connections['Audit Log'];
  delete wf.connections['Mark Follow-up Delivered'];
  wf.connections['Insert Follow-up Message'] = {
    main: [[{ node: 'WAHA Send Follow-up', type: 'main', index: 0 }]],
  };
  wf.connections['WAHA Send Follow-up'] = {
    main: [[{ node: 'Format Output', type: 'main', index: 0 }]],
  };
  note(file, 'removed the audit and delivery nodes, which read ids from an item an HTTP request had replaced');

  // The output read a paired item, so the assistant was told a follow-up went
  // to "undefined".
  const format = nodeOf(wf, 'Format Output');
  format.parameters.jsCode = `const sent = $input.all();
const inserted = $('Insert Follow-up Message').all();
return sent.map((item, index) => {
  const metadata = (inserted[index] && inserted[index].json && inserted[index].json.metadata) || {};
  const failed = item.json && (item.json.error || (item.json.success === false));
  return {
    json: {
      success: !failed,
      message: failed
        ? 'The follow-up could not be sent. The team will follow up manually.'
        : \`Follow-up sent for quote \${metadata.quote_number || 'your quote'} to \${metadata.display_name || metadata.phone || 'you'}\`,
      quote_number: metadata.quote_number || null,
      follow_up_type: metadata.follow_up_type || null,
    }
  };
});`;
  note(file, 'the output now reports the quote and contact instead of "undefined"');
  save(file, wf, hadBom);
}

// --- 4 and 5: 10 Abandoned Conversation Recovery ---------------------------
{
  const file = '10 - Abandoned Conversation Recovery.json';
  const { wf, hadBom } = load(file);

  const insert = nodeOf(wf, 'Insert Recovery Message');
  const originalQuery = insert.parameters.query;
  const originalParams = insert.parameters.options?.queryReplacement || '';

  // Fold the audit row into the insert so the conversation and contact ids
  // are already to hand.
  const match = originalParams.match(/\[([\s\S]*?)\]\s*\}\}/);
  const paramList = match ? match[1] : '';
  const values = paramList.split(',').map((s) => s.trim()).filter(Boolean);

  insert.parameters.query = `
WITH msg AS (
  ${originalQuery.replace(/;\s*$/, '')}
), audited AS (
  INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, performed_by_type, description, new_values, metadata, business_id)
  SELECT 'conversation', NULLIF($1, '')::uuid, 'recovery_attempt', NULL, 'system',
         'Recovery attempt sent for abandoned conversation',
         jsonb_build_object('recovery_attempt', true),
         jsonb_build_object('contact_id', NULLIF($2, '')::uuid, 'timestamp', NOW()),
         NULLIF($3, '')::uuid
  RETURNING id
)
SELECT msg.* FROM msg, audited;
`.trim();

  insert.parameters.options = {
    ...(insert.parameters.options || {}),
    queryReplacement:
      "={{ [" + values.join(', ') + ", String(($json.contact_id) ?? '')] }}",
  };

  note(file, 'the insert now writes the audit row, with a null performed_by and a valid performed_by_type');

  wf.nodes = wf.nodes.filter((n) => n.name !== 'Audit Log');
  delete wf.connections['Audit Log'];
  wf.connections['WAHA Send Recovery'] = {
    main: [[{ node: 'Format Output', type: 'main', index: 0 }]],
  };
  note(file, 'removed the audit node, which read the conversation id from an item an HTTP request had replaced');
  save(file, wf, hadBom);
}

for (const line of changes) console.log('  ' + line);
console.log(`\n${changes.length} changes across ${new Set(changes.map((c) => c.split(':')[0])).size} workflows`);
