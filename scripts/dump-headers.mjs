import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(here, '..', 'workflows');

for (const entry of readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))) {
  let raw = readFileSync(join(workflowsDir, entry), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let wf = JSON.parse(raw);
  wf = Array.isArray(wf) ? wf[0] : wf;
  if (!wf?.nodes) continue;

  for (const node of wf.nodes) {
    const p = node.parameters || {};
    if (node.type !== 'n8n-nodes-base.httpRequest') continue;
    const url = String(p.url || '');
    if (!/backend:4000/.test(url)) continue;

    console.log(`\n=== ${entry} :: ${node.name} ===`);
    console.log(`  ${p.method || 'GET'} ${url.replace('http://backend:4000', '')}`);
    const headers = (p.headerParameters && p.headerParameters.parameters) || [];
    for (const h of headers) {
      console.log(`    ${h.name}: ${String(h.value).slice(0, 150)}`);
    }
    if (!headers.length) console.log('    (no headers)');
    if (p.authentication) console.log(`    authentication: ${p.authentication} / ${p.authenticationType || ''}`);
    if (p.credentials) console.log(`    credentials  : ${JSON.stringify(p.credentials)}`);
  }
}
