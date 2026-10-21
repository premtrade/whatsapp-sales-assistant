import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(here, '..', 'workflows');

const wanted = process.argv.slice(2);

for (const entry of readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))) {
  if (wanted.length && !wanted.some((w) => entry.includes(w))) continue;
  let wf = JSON.parse(readFileSync(join(workflowsDir, entry), 'utf8'));
  wf = Array.isArray(wf) ? wf[0] : wf;
  if (!wf?.nodes) continue;

  console.log(`\n${'='.repeat(78)}\n${entry}\n  name in n8n: ${wf.name}\n${'='.repeat(78)}`);

  // execution order
  const order = [];
  const walk = (name) => {
    const node = wf.nodes.find((n) => n.name === name);
    if (!node || order.includes(node)) return;
    for (const v of Object.values(wf.connections || {})) {
      for (const b of v.main || []) for (const t of b) if (t.node === name) walk(node.name === name ? t.node : t.node);
    }
    order.push(node);
  };
  const incoming = new Set();
  for (const v of Object.values(wf.connections || {})) for (const b of v.main || []) for (const t of b) incoming.add(t.node);
  for (const node of wf.nodes) if (!incoming.has(node.name)) walk(node.name);
  for (const node of wf.nodes) if (!order.includes(node)) order.push(node);

  for (const node of order) {
    const p = node.parameters || {};
    console.log(`\n  --- ${node.name}  [${node.type}] ---`);
    if (p.operation) console.log('      operation:', p.operation);
    if (p.rule) console.log('      schedule :', JSON.stringify(p.rule.interval || p.rule));
    if (p.query) console.log('      query    :', p.query.split(/\s+/).join(' ').slice(0, 400));
    const rep = (p.options && p.options.queryReplacement) || '';
    if (rep) console.log('      params  :', rep.replace(/\s+/g, ' ').slice(0, 400));
    if (p.jsCode) console.log('      code    :', p.jsCode.split('\n').map((l) => '        ' + l).join('\n').slice(0, 1200));
    if (p.jsonBody) console.log('      body    :', String(p.jsonBody).replace(/\s+/g, ' ').slice(0, 300));
    if (p.url) console.log('      url     :', p.url);
  }
}
