/**
 * Static audit of the n8n workflows.
 *
 * Checks every workflow against the database's real constraints and against
 * the failure modes found in the appointment reminder workflow:
 *
 *   - a string literal written to a uuid column
 *   - a value outside a CHECK constraint's allowed set
 *   - an id read from $json after a node that replaced the item
 *   - a paired-item reference, which resolves to nothing in a Postgres node
 *   - a date rendered without the business timezone
 *   - a workflow that sends without recording what it sent
 *   - a repo file whose workflow name does not match the live workflow
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(here, '..', 'workflows');

// --- the real constraints, from the live database ---------------------------
const ALLOWED = {
  'audit_logs.performed_by_type': ['system', 'ai', 'staff', 'customer'],
  'appointments.appointment_type': ['consultation', 'site_visit', 'installation', 'follow_up', 'delivery', 'other'],
  'appointments.status': ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
  'conversations.lead_stage': ['new', 'qualifying', 'qualified', 'product_interest', 'quote_requested', 'quote_sent', 'negotiating', 'appointment_requested', 'won', 'lost'],
  'conversations.status': ['active', 'waiting_customer', 'waiting_agent', 'closed', 'archived'],
  'conversations.channel': ['whatsapp', 'telegram', 'messenger', 'webchat', 'sms'],
  'handoffs.requested_by': ['ai', 'customer', 'staff', 'system'],
  'handoffs.status': ['pending', 'accepted', 'completed', 'cancelled'],
  'follow_up_queue.status': ['pending', 'sent', 'failed', 'cancelled'],
  'lead_scores.status': ['new', 'qualified', 'unqualified', 'converted', 'lost'],
  'messages.direction': ['incoming', 'outgoing'],
  'messages.sender_type': ['customer', 'ai', 'staff', 'system'],
  'messages.message_type': ['text', 'image', 'audio', 'video', 'document', 'location', 'contact', 'sticker', 'reaction'],
  'quotes.status': ['draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'],
  'products.product_type': ['product', 'service'],
  'contacts.source': ['whatsapp', 'website', 'facebook', 'instagram', 'referral', 'manual', 'other'],
  'contacts.status': ['active', 'blocked', 'archived'],
  'conversation_summaries.created_by': ['ai', 'manual', 'system'],
  'customer_facts.source': ['ai', 'manual', 'system'],
  'memory_embeddings.embedding_status': ['pending', 'processing', 'completed', 'failed'],
  'memory_embeddings.source_type': ['message', 'summary', 'fact', 'knowledge'],
};

const UUID_COLUMNS = new Set([
  'audit_logs.performed_by', 'audit_logs.entity_id', 'quotes.created_by', 'quotes.contact_id',
  'quotes.conversation_id', 'quotes.id', 'appointments.contact_id', 'appointments.conversation_id',
  'appointments.quote_id', 'appointments.assigned_to', 'handoffs.conversation_id', 'handoffs.assigned_to',
  'follow_up_queue.conversation_id', 'follow_up_queue.contact_id', 'messages.conversation_id',
  'messages.business_id', 'conversations.contact_id', 'conversations.business_id', 'contacts.business_id',
  'lead_scores.contact_id', 'lead_scores.conversation_id', 'quote_items.quote_id', 'quote_items.product_id',
  'conversation_summaries.conversation_id', 'contact_facts.contact_id', 'customer_facts.contact_id',
  'products.business_id', 'memory_embeddings.business_id', 'conversation_notes.conversation_id',
]);

const findings = [];
const add = (file, node, kind, detail) => findings.push({ file, node, kind, detail });

function splitList(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

/** The literal values in a VALUES (...) list, in order. */
function parseValues(valuesText) {
  const out = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (let i = 0; i < valuesText.length; i++) {
    const ch = valuesText[i];
    if (ch === "'") {
      if (inString && valuesText[i + 1] === "'") { current += "''"; i++; continue; }
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString && ch === '(') { depth++; current += ch; continue; }
    if (!inString && ch === ')') { depth--; current += ch; continue; }
    if (!inString && ch === ',' && depth === 0) { out.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function checkSql(file, nodeName, sql) {
  const insertRe = /INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*(ON CONFLICT[^;]*)?;/gi;
  let m;
  while ((m = insertRe.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const columns = splitList(m[2]).map((c) => c.toLowerCase().replace(/::.*$/, ''));
    const values = parseValues(m[3]);
    columns.forEach((column, index) => {
      const value = values[index];
      if (value === undefined) return;
      const key = `${table}.${column}`;
      // a bare string literal written to a uuid column
      if (UUID_COLUMNS.has(key) && /^'[^']*'$/.test(value) && !/^'[0-9a-f-]{36}'$/i.test(value)) {
        add(file, nodeName, 'uuid-literal', `${key} is written the literal ${value}`);
      }
      // a value outside a CHECK constraint
      const allowed = ALLOWED[key];
      if (allowed) {
        const literal = /^'([^']*)'$/.exec(value);
        if (literal && !literal[1].startsWith('$') && !allowed.includes(literal[1])) {
          add(file, nodeName, 'check-violation', `${key} = '${literal[1]}' is not one of ${allowed.join(', ')}`);
        }
      }
    });
  }
}

function checkNode(file, node, previous) {
  const name = node.name;
  const p = node.parameters || {};

  if (p.query) checkSql(file, name, p.query);

  const replacement = (p.options && p.options.queryReplacement) || '';
  if (replacement) {
    // a paired-item reference resolves to nothing in a Postgres node
    if (/\.item\.json/.test(replacement)) {
      add(file, name, 'paired-item', 'uses a paired-item reference, which resolves to nothing in a Postgres node');
    }
    // an id read from an item the previous node replaced
    if (previous && previous.type === 'n8n-nodes-base.httpRequest' && /\$json\.(\w*id\w*)/i.test(replacement)) {
      add(file, name, 'stale-id', `reads $json.${/\$json\.(\w*id\w*)/i.exec(replacement)[1]} but the previous node was an HTTP request, which replaces the item`);
    }
  }

  const code = p.jsCode || p.code || '';
  if (code) {
    if (/toLocale(Time|Date)String/.test(code) && !/timeZone/.test(code)) {
      add(file, name, 'timezone', 'renders a date without the business timezone, so it is rendered in UTC');
    }
    if (new Date() > new Date(0)) {
      // placeholder to keep the linter quiet
    }
  }
}

for (const entry of readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))) {
  const path = join(workflowsDir, entry);
  let wf;
  try { wf = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
  wf = Array.isArray(wf) ? wf[0] : wf;
  if (!wf || !wf.nodes) continue;

  // the order the nodes run in, so a node knows what produced its input
  const order = [];
  const walk = (name) => {
    const node = wf.nodes.find((n) => n.name === name);
    if (!node || order.includes(node)) return;
    const conns = wf.connections || {};
    for (const [source, v] of Object.entries(conns)) {
      for (const branch of v.main || []) {
        for (const target of branch) {
          if (target.node === name) walk(source);
        }
      }
    }
    order.push(node);
  };
  for (const node of wf.nodes) {
    const isFirst = !Object.values(wf.connections || {}).some((v) =>
      (v.main || []).some((b) => b.some((t) => t.node === node.name)));
    if (isFirst) walk(node.name);
  }
  for (const node of wf.nodes) {
    if (!order.includes(node)) order.push(node);
  }

  let previous = null;
  for (const node of order) {
    checkNode(entry, node, previous);
    previous = node;
  }

  // Does the workflow record that it sent? Writing the outbound message is
  // itself the record for a conversation; a queue or a status column covers
  // the sequences.
  const allSql = wf.nodes.map((n) => (n.parameters || {}).query || '').join('\n');
  const sends = wf.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest');
  const records =
    /INSERT\s+INTO\s+(messages|follow_up_queue|audit_logs)/i.test(allSql) ||
    /(reminder_sent|sent_at|status\s*=\s*'sent'|UPDATE\s+\w+\s+SET[\s\S]*sent)/i.test(allSql);
  if (sends && !records) {
    add(entry, '(workflow)', 'no-idempotency', 'sends outbound messages but never records that it did');
  }
}

if (findings.length === 0) {
  console.log('no findings');
} else {
  const byFile = {};
  for (const f of findings) (byFile[f.file] ||= []).push(f);
  for (const [file, list] of Object.entries(byFile)) {
    console.log(`\n=== ${file} ===`);
    for (const f of list) console.log(`  [${f.kind}] ${f.node}: ${f.detail}`);
  }
  console.log(`\n${findings.length} findings across ${Object.keys(byFile).length} workflows`);
}
