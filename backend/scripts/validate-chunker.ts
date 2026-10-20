import { chunkText, countTokens, validateChunkSize } from '../src/services/chunker';

const sample = `
=== Our Services ===
5.1 AI Customer Assistant - WhatsApp chatbot that answers customer questions 24/7. Pricing starts at $199/month. Includes 1,000 conversations per month.
5.2 CRM Integration - We integrate with HubSpot, Salesforce, Pipedrive and 40+ other tools. Migration takes 2-3 business days.
5.3 Appointment Scheduling - Customers book directly in WhatsApp. Reminders sent over WhatsApp. No-show reminders included.

=== Pricing ===
All plans billed monthly. Enterprise plan includes dedicated support. Contact sales for custom pricing.

=== About Rolinj ===
Rolinj builds AI assistants for small businesses. Founded in 2024.
`;

const chunks = chunkText(sample);
console.log(`chunks: ${chunks.length}`);
for (const c of chunks) {
  console.log(`  #${c.chunkIndex} section=${JSON.stringify(c.section)} est=${c.tokenCount} words=${countTokens(c.text)} valid=${validateChunkSize(c.text)}`);
  console.log(`    "${c.text.slice(0, 110)}${c.text.length > 110 ? '…' : ''}"`);
}

// Invariants
let failed = false;
const assert = (cond: boolean, msg: string) => { if (!cond) { console.error(`FAIL: ${msg}`); failed = true; } };

assert(chunks.length >= 3, 'produces multiple chunks');
assert(chunks.every((c) => validateChunkSize(c.text)), 'every chunk fits the model window');
assert(chunks.every((c, i) => i === 0 || c.chunkIndex > chunks[i - 1].chunkIndex), 'chunk indices strictly increasing');
assert(chunks.some((c) => c.section === 'Our Services'), 'section titles carried into metadata');
assert(chunks.some((c) => c.text.startsWith('[Our Services]')), 'section title prefixed into chunk text');
const services = chunks.filter((c) => c.section === 'Our Services');
assert(services.some((c) => c.text.includes('5.1 AI Customer Assistant') && c.text.includes('$199')), 'service row kept whole (title+price in same chunk)');
assert(chunks.every((c) => c.section === null || !c.text.startsWith('[null]')), 'no null section leaked into prefix');

// Plain doc without dividers -> anonymous section, still chunked.
const plain = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about services and pricing and scheduling and CRM.`).join(' ');
const plainChunks = chunkText(plain);
assert(plainChunks.length > 1, 'plain doc still splits into multiple chunks');
assert(plainChunks.every((c) => c.section === null), 'plain doc sections are null');
assert(plainChunks.every((c) => validateChunkSize(c.text)), 'plain doc chunks fit model window');

// Huge single sentence must be split, not exceed ceiling.
const huge = Array.from({ length: 500 }, () => 'supercalifragilisticexpialidocious').join(' ');
const hugeChunks = chunkText(huge);
assert(hugeChunks.length > 1, 'huge sentence splits');
assert(hugeChunks.every((c) => validateChunkSize(c.text)), 'huge sentence chunks fit model window');

// Overlap: consecutive chunks within a section share tail words.
const longSection = `=== Section ===\n` + Array.from({ length: 40 }, (_, i) => `Alpha beta gamma delta epsilon zeta eta theta ${i}.`).join(' ');
const overlapChunks = chunkText(longSection);
if (overlapChunks.length >= 2) {
  const tail = overlapChunks[0].text.split(/\s+/).slice(-5).join(' ');
  assert(overlapChunks[1].text.includes(tail.split(' ')[0]), 'overlap present between consecutive chunks');
}

// Custom small options still clamp to model ceiling.
const tiny = chunkText(sample, { maxTokens: 100, overlapTokens: 10 });
assert(tiny.every((c) => validateChunkSize(c.text)), 'custom options still respect ceiling');

if (failed) {
  console.error('\nVALIDATION FAILED');
  process.exit(1);
}
console.log('\nAll chunker validations passed.');
