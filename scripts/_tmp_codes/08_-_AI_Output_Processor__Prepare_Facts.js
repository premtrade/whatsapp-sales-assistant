const input = $('When Executed by Another Workflow').first()?.json || {};
const facts = Array.isArray(input.facts_extracted) ? input.facts_extracted : [];
const conversationId = input.conversation_id || '';
const contactId = input.contact_id || '';
const leadStage = input.lead_stage || 'new';
const intent = input.intent || 'general_inquiry';
const escalate = !!input.escalate;
const escalationReason = input.escalation_reason || '';

return [{
  json: {
    conversation_id: conversationId,
    contact_id: contactId,
    lead_stage: leadStage,
    intent,
    sentiment: input.sentiment || 'neutral',
    escalate,
    escalation_reason: escalationReason,
    facts_extracted: facts,
    customer_name: input.customer_name || '',
    phone: input.phone || '',
  }
}];