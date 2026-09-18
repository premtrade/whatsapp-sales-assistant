const result = $('Extract Customer Facts').first()?.json || {};
const facts = result.output?.facts || result.facts || [];
const contactId = $('When Executed by Another Workflow').first().json.contact_id;

const normalizedFacts = facts.map(f => ({
  contact_id: contactId,
  fact_key: String(f.fact_key),
  fact_value: String(f.fact_value),
  confidence: Number(f.confidence || 0.9),
  source: 'ai'
}));

return [{ json: { facts: normalizedFacts, count: normalizedFacts.length } }];