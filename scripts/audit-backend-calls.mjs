import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(here, '..', 'workflows');

// The backend's internal webhook endpoints require these (middleware/webhookAuth.ts)
const REQUIRED_HEADERS = ['x-timestamp', 'x-webhook-secret'];

const rows = [];
const bomFiles = [];
for (const entry of readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))) {
  let raw = readFileSync(join(workflowsDir, entry), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) {
    bomFiles.push(entry);
    raw = raw.slice(1);
  }
  let wf = JSON.parse(raw);
  wf = Array.isArray(wf) ? wf[0] : wf;
  if (!wf?.nodes) continue;

  for (const node of wf.nodes) {
    const p = node.parameters || {};
    if (node.type !== 'n8n-nodes-base.httpRequest') continue;
    const url = String(p.url || '');
    if (!/backend:4000/.test(url)) continue;

    const headerValues = (p.headerParameters && p.headerParameters.parameters) || [];
    const sent = headerValues.map((h) => String(h.name || '').toLowerCase());
    const missing = REQUIRED_HEADERS.filter((h) => !sent.includes(h));
    const body = String(p.jsonBody || p.body || '');

    rows.push({
      file: entry,
      node: node.name,
      url: url.replace('http://backend:4000', ''),
      method: p.method || 'GET',
      missing,
      hasBody: body.trim().length > 0,
      onError: p.onError || (p.continueOnFail ? 'continueOnFail' : '(none)'),
      body: body.replace(/\s+/g, ' ').slice(0, 120),
    });
  }
}

if (!rows.length) {
  console.log('no workflow calls the backend over http');
} else {
  for (const r of rows) {
    const bad = r.missing.length > 0;
    console.log(`\n${bad ? 'BROKEN' : '  ok  '}  ${r.file}`);
    console.log(`        ${r.method} ${r.url}`);
    console.log(`        headers sent : ${r.missing.length ? 'MISSING ' + r.missing.join(', ') : 'all present'}`);
    console.log(`        on error     : ${r.onError}`);
    if (r.hasBody) console.log(`        body         : ${r.body}`);
  }
  console.log(`\n${rows.filter((r) => r.missing.length).length} of ${rows.length} backend calls are missing required auth headers`);
}

if (bomFiles.length) {
  console.log(`\nfiles saved with a UTF-8 BOM (n8n may reject these on import):`);
  for (const f of bomFiles) console.log('   ', f);
}
