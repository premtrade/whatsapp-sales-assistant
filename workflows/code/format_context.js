// Format Context (Workflow 2 - AI Brain)
//
// Assembles the CONTEXT that the AI model receives. IMPORTANT: n8n does NOT
// resolve {{ }} expressions inside the AI Agent node's `options.systemMessage`
// - it forwards the raw template string to the model. That was the root cause
// of two production bugs:
//   1. the model never saw the tenant's business name and invented one
//      ("You're speaking with Acme Corp"),
//   2. the model never saw the retrieved knowledge and answered
//      "I don't have the details on our services".
// The dynamic context is therefore emitted as `finalPrompt` and passed to the
// agent through the `text` parameter (a top-level parameter, which n8n does
// resolve), while the agent's system message holds static rules only.
try {
  const ctx = $input.first()?.json || {};

  // De-duplicate customer facts (keep the newest value per key) so the prompt
  // is not flooded with contradictory duplicates.
  const rawFacts = Array.isArray(ctx.customer_facts) ? ctx.customer_facts.filter(f => f && f.fact_key && f.fact_value !== null && f.fact_value !== undefined && f.fact_key !== 'null') : [];
  const factMap = new Map();
  for (const f of rawFacts) factMap.set(String(f.fact_key), f);
  const facts = [...factMap.values()].slice(0, 12);
  const factName = facts.find(f => f.fact_key === 'customer_name')?.fact_value || '';

  // Tenant identity. NEVER fall back to another tenant's name: an unresolved
  // identity must stay unresolved so the agent cannot name a wrong company.
  const businessName = String(ctx.business_name || ctx.business_slug || '').trim();
  const businessKnown = Boolean(businessName);

  const customerName = (ctx.customer?.name && ctx.customer.name !== 'Unknown' ? ctx.customer.name : factName) || 'Unknown';
  const customerText = String(ctx.current_message?.text || '');

  let context = '';
  if (businessKnown) {
    context += `AUTHORITATIVE BUSINESS IDENTITY: ${businessName}\n`;
    context += `YOUR BUSINESS NAME (copy it verbatim whenever you name the business): ${businessName}\n`;
  } else {
    context += 'AUTHORITATIVE BUSINESS IDENTITY: UNKNOWN (the tenant for this conversation could not be resolved)\n';
    context += 'You must NOT name any company. Never invent, guess, shorten or assume a business name. Tell the customer you will connect them with a representative.\n';
  }
  context += `BUSINESS LOCAL DATE AND TIME: ${ctx.current_business_time || 'unknown'} (${ctx.business_timezone || 'timezone not configured'}). Use this local reference to interpret relative appointment dates.\n`;
  context += 'Never output unresolved template expressions such as {{ $json.business_name }}. If asked about the business, answer using the business identity above.\n';
  if (customerName !== 'Unknown') context += `AUTHORITATIVE CUSTOMER NAME: ${customerName}\nIf asked the customer name, answer it directly.\n`;
  if (ctx.customer?.phone) context += `CUSTOMER PHONE: ${ctx.customer.phone}\n`;
  if (facts.length) {
    context += '\nCUSTOMER FACTS:\n';
    for (const f of facts) context += `- ${f.fact_key}: ${f.fact_value}\n`;
  }
  context += '\nKNOWLEDGE CHUNKS AVAILABLE: ' + (ctx.knowledge_count || 0) + '\n';
  if (typeof ctx.knowledge_max_similarity === 'number') {
    context += `KNOWLEDGE RELEVANCE: best score ${ctx.knowledge_max_similarity.toFixed(3)} (${ctx.knowledge_confidence || 'unknown'}). Scores >= 0.30 are strong; below is weak - use cautiously.\n`;
  }
  if (ctx.knowledge_preview) context += 'KNOWLEDGE PREVIEW: ' + ctx.knowledge_preview + '\n';
  if (Array.isArray(ctx.knowledge) && ctx.knowledge.length) {
    context += '\nAUTHORITATIVE KNOWLEDGE:\n';
    for (const kb of ctx.knowledge.slice(0, 8)) {
      const _s = (typeof kb.similarity === 'number') ? kb.similarity.toFixed(3) : 'n/a';
      const _src = kb.source || 'unknown';
      context += `- [score ${_s} | source ${_src}] ${kb.chunk_text}\n`;
    }
  } else {
    context += '\nAUTHORITATIVE KNOWLEDGE: none retrieved - say you do not have the answer and escalate.\n';
  }
  if (Array.isArray(ctx.products) && ctx.products.length) {
    context += '\nPRODUCTS:\n';
    for (const p of ctx.products.slice(0, 20)) context += `- ${p.name}: ${p.price} ${p.currency}\n`;
  }

  const recent = Array.isArray(ctx.recent_messages) ? ctx.recent_messages.slice(-6) : [];
  const history = recent.map(m => `${m.direction === 'in' || m.direction === 'incoming' ? 'Customer' : 'Assistant'}: ${m.text_body}`).join('\n') || 'No previous messages.';

  // The message the agent receives: CONTEXT first (authoritative), then the
  // customer's own words, clearly separated.
  const finalPrompt = context + '\n=== RECENT CONVERSATION ===\n' + history + '\n\n=== CUSTOMER MESSAGE ===\n' + customerText + '\n';

  return [{
    json: {
      formattedPrompt: context,
      finalPrompt,
      business_name: businessName,
      business_name_known: businessKnown,
      time_greeting: ctx.time_greeting || 'evening',
      business_timezone: ctx.business_timezone || 'America/Jamaica',
      conversationHistory: history,
      customerFacts: facts,
      customerName,
      knowledgeMaxSimilarity: ctx.knowledge_max_similarity ?? null,
      knowledgeConfidence: ctx.knowledge_confidence || 'none',
      currentMessage: customerText
    }
  }];
} catch (e) {
  const errMsg = (e && e.message) ? e.message : 'unknown error';
  const safeContext = 'AUTHORITATIVE BUSINESS IDENTITY: UNKNOWN\nCONTEXT UNAVAILABLE - do not name a company, do not answer from memory. Escalate to a representative.\n';
  return [{
    json: {
      formattedPrompt: safeContext,
      finalPrompt: safeContext + '\n=== CUSTOMER MESSAGE ===\n',
      business_name: '',
      business_name_known: false,
      conversationHistory: 'No previous messages.',
      customerFacts: [],
      customerName: 'Unknown',
      error: errMsg
    }
  }];
}
