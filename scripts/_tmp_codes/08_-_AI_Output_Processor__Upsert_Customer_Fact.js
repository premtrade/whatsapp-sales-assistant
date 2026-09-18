const item = $input.first()?.json || {};
const facts = Array.isArray(item.facts_extracted) ? item.facts_extracted : [];
const contactId = item.contact_id || '';
const conversationId = item.conversation_id || '';
const leadStage = item.lead_stage || 'new';
const intent = item.intent || 'general_inquiry';
const sentiment = item.sentiment || 'neutral';
const escalate = !!item.escalate;
const escalationReason = item.escalation_reason || '';

const results = [];
for (const fact of facts) {
  if (fact && fact.key && fact.value) {
    results.push({
      contact_id: contactId,
      conversation_id: conversationId,
      fact_key: String(fact.key),
      fact_value: String(fact.value),
      confidence: typeof fact.confidence === 'number' ? fact.confidence : 1.0,
      source: 'ai',
      lead_stage: leadStage,
      intent,
      sentiment,
      escalate,
      escalation_reason: escalationReason,
    });
  }
}

if (results.length === 0) {
  results.push({
    contact_id: contactId,
    conversation_id: conversationId,
    fact_key: null,
    fact_value: null,
    confidence: 0,
    source: 'ai',
    lead_stage: leadStage,
    intent,
    sentiment,
    escalate,
    escalation_reason: escalationReason,
  });
}

return results.map(r => ({ json: r }));