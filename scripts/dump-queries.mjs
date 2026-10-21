import { readFileSync } from 'node:fs';

const file = process.argv[2];
let raw = readFileSync('workflows/' + file, 'utf8');
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const wf = JSON.parse(raw);
const w = Array.isArray(wf) ? wf[0] : wf;

for (const n of w.nodes) {
  const q = n.parameters?.query;
  if (!q) continue;
  if (!/follow|metadata|sent_at/i.test(q)) continue;
  console.log(`\n--- ${n.name} ---`);
  console.log(q.replace(/\s+/g, ' '));
}
