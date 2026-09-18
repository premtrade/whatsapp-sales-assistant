const input = $input.first()?.json || {};
const rawValue = input.output || input.text || input.content || '';
const raw = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
let parsed;
try { parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim()); } catch { parsed = { reply: raw }; }

const trigger = $('When Executed by Another Workflow').first()?.json || {};
const context = $('Format Context').first()?.json || {};
const businessName = context.business_name || 'our company';
const message = String(trigger.message || '').trim();
const lower = message.toLowerCase();

// Only the AUTHORITATIVE KNOWLEDGE section may be quoted to a customer. CUSTOMER FACTS,
// PRODUCTS and RECENT HISTORY must never be echoed back (they leaked as replies such as
// "service_interest: project management services").
const promptText = String(context.formattedPrompt || '');
const knowledgeBlock = promptText.split('AUTHORITATIVE KNOWLEDGE:')[1] || '';
const lines = knowledgeBlock
  .split(String.fromCharCode(10))
  .map(line => String(line).replace(/^[- ]+/, '').trim())
  .filter(line => line.length > 30)
  .filter(line => !/^(AI MUST NOT|DO NOT|NEVER|If customer asks for quote)/i.test(line))
  .filter(line => !/^[a-z][a-z0-9_]{2,}:\s/.test(line));
const findLine = (pattern, excluded) => lines.find(line => pattern.test(line) && !(excluded && excluded.test(line)));

const greeting = /^(hi|hello|hey|good (morning|afternoon|evening|day))[!. ,]*$/i.test(message);
const identityQuestion = (lower.includes('is this') || lower.includes('are you')) && /garco|company|business|construction/i.test(lower);
const wantsServices = /\b(service|services|offer|what do you do)\b/i.test(lower);
const wantsFounder = /\b(founder|founded|established)\b/i.test(lower);
const wantsLocation = /\b(locat|address)\w*\b/i.test(lower);
const wantsCoverage = /\b(island[- ]wide|all across jamaica|outside kingston)\b/i.test(lower);
const wantsPrice = /\b(cost|price|pricing|quote|quotation|estimate|charge|rate)\b/i.test(lower);
const wantsAppointment = /\b(appointment|site visit|schedule|book|meeting)\b/i.test(lower);

// Time-of-day greeting in the business timezone (was hardcoded to "Good evening").
const timeZone = context.business_timezone || 'America/Jamaica';
let hour = new Date().getHours();
try {
  hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(new Date())) % 24;
} catch (e) { /* keep server hour */ }
const partOfDay = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');

let reply = typeof parsed.reply === 'string' ? parsed.reply : String(raw);

// Resolve any unresolved template syntax instead of shipping it to the customer.
reply = reply.replace(/\{\{[^}]*\}\}/g, businessName);

const isRefusal = /don't have that information|do not have that information|not sure|cannot help|no information|unable to answer/i.test(reply);

if (greeting) {
  reply = `${partOfDay}! This is ${businessName}. How can I help you today?`;
} else if (identityQuestion) {
  reply = `Yes, this is ${businessName}. How can I help you today?`;
} else if (isRefusal) {
  // The model could not answer from context: fall back to an exact knowledge line when one fits.
  let fallback = '';
  if (wantsPrice) fallback = 'We do not publish standard prices. A customized quotation is prepared after reviewing the project scope. Please share the project location and preferred timing and we will arrange the next step.';
  else if (wantsAppointment) fallback = 'I can help arrange a site visit. Please share the project location and your preferred date and time and I will confirm it for you.';
  else if (wantsFounder) fallback = findLine(/founded|founder|established/i) || '';
  else if (wantsLocation) fallback = findLine(/kingston|address|located/i, /website/i) || '';
  else if (wantsCoverage) fallback = findLine(/kingston|jamaica|island/i, /website/i) || '';
  else if (wantsServices) fallback = findLine(/offers|services|general construction|renovation/i, /website/i) || '';
  if (fallback) reply = fallback;
}

// Never let the assistant claim a booking/quote/handoff happened unless the tool really ran.
if (/\b(i(?:'ve| have)? (?:scheduled|booked)|has been scheduled|has been booked|appointment (?:is )?(?:confirmed|set)|quote (?:has been|is) created)\b/i.test(reply)) {
  let toolRan = false;
  try {
    const toolResult = $('Call \'05 - Appointment Tool\').first()?.json || {};
    toolRan = Boolean(toolResult.appointment_id || toolResult.appointment_details) && toolResult.success !== false;
  } catch (e) { toolRan = false; }
  if (!toolRan) {
    reply = 'I can help arrange a site visit. Please share the project location and your preferred date and time, and I will confirm it for you.';
  }
}

// Internal guardrail text must never be quoted to a customer.
if (/\{\{|AI MUST NOT|approved knowledge base|Do not (?:claim|invent|state)|should be confirmed by a Garco representative|internal (?:note|guidance)/i.test(reply)) {
  reply = 'I do not have that in my notes. Let me connect you with a Garco representative who can confirm it for you.';
}

return [{
  json: {
    reply,
    facts_extracted: Array.isArray(parsed.facts_extracted) ? parsed.facts_extracted : [],
    intent: typeof parsed.intent === 'string' ? parsed.intent : 'general_inquiry',
    lead_stage: typeof parsed.lead_stage === 'string' ? parsed.lead_stage : 'new',
    sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
    escalate: !!parsed.escalate,
    escalation_reason: typeof parsed.escalation_reason === 'string' ? parsed.escalation_reason : '',
    conversation_id: trigger.conversation_id || '',
    contact_id: trigger.contact_id || ''
  }
}];
