const input = $input.first()?.json || {};
const rawValue = input.output || input.text || input.content || '';
const raw = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
const cleaned = String(raw).split('`' + '``' + 'json').join('').split('`' + '``').join('').trim();
function quoted(text, name) {
  const m = String(text).match(new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"', 's'));
  if (!m) return '';
  try { return JSON.parse('"' + m[1] + '"'); } catch (e) { return m[1]; }
}
let parsed = null;
try { parsed = JSON.parse(cleaned); } catch (e) { parsed = null; }
if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  const boolMatch = cleaned.match(/"escalate"\s*:\s*(true|false)/i);
  parsed = {
    reply: quoted(cleaned, 'reply') || cleaned,
    intent: quoted(cleaned, 'intent') || 'general_inquiry',
    lead_stage: quoted(cleaned, 'lead_stage') || 'qualifying',
    sentiment: quoted(cleaned, 'sentiment') || 'neutral',
    escalation_reason: quoted(cleaned, 'escalation_reason') || '',
    appointment_date: quoted(cleaned, 'appointment_date') || '',
    appointment_time: quoted(cleaned, 'appointment_time') || '',
    appointment_type: quoted(cleaned, 'appointment_type') || '',
    appointment_title: quoted(cleaned, 'appointment_title') || '',
    appointment_location: quoted(cleaned, 'appointment_location') || '',
    appointment_duration: quoted(cleaned, 'appointment_duration') || '',
    quote_product: quoted(cleaned, 'quote_product') || '',
    quote_quantity: quoted(cleaned, 'quote_quantity') || '',
    facts_extracted: [],
    escalate: boolMatch ? boolMatch[1].toLowerCase() === 'true' : false
  };
}
const trigger = $('When Executed by Another Workflow').first()?.json || {};
const fcCtx = $('Format Context').first()?.json || {};
const businessName = String(fcCtx.business_name || '').trim();
const businessKnown = fcCtx.business_name_known !== false && businessName.length > 0;
const greetWord = String(fcCtx.time_greeting || trigger.time_greeting || 'evening');
const customerMsg = String(trigger.message || '');
let reply = (typeof parsed.reply === 'string' && parsed.reply.trim()) ? parsed.reply.trim() : (quoted(cleaned, 'reply') || String(raw).trim());
let escalate = !!parsed.escalate;
let escalationReason = (typeof parsed.escalation_reason === 'string') ? parsed.escalation_reason : '';
let intent = (typeof parsed.intent === 'string' && parsed.intent) ? parsed.intent : 'general_inquiry';
if (/{{|\$json|\$node|\$env/.test(reply)) {
  reply = businessKnown
    ? 'Good ' + greetWord + '! You\'re speaking with ' + businessName + '. How can I help you today?'
    : 'Good ' + greetWord + '! How can I help you today?';
}

// Deterministic greeting: for a message that is only a greeting we build the
// reply ourselves so the business is ALWAYS identified with the exact tenant
// name from the database - the model is never allowed to invent one.
const pureGreeting = /^\s*(hi|hey|hello|yo|sup|hiya|good\s+(morning|afternoon|evening|night)|greetings|how\s+are\s+you|how('s|\s+is)\s+it\s+going|just\s+saying\s+hi)\b[\s!.?]*$/i;
if (businessKnown && pureGreeting.test(customerMsg)) {
  reply = 'Good ' + greetWord + '! You\'re speaking with ' + businessName + '. How can I help you today?';
  escalate = false;
  escalationReason = '';
  intent = 'general_inquiry';
}

// Company-name guard: the model must never name a company that is not this
// tenant (it used to answer "You're speaking with Acme Corp"). Any foreign
// "<Something> Corp/Solutions/Ltd/..." is replaced by the tenant's own name.
if (businessKnown) {
  const foreignNameRe = /\b[A-Z][A-Za-z0-9&'.\-]*(?:\s+[A-Z][A-Za-z0-9&'.\-]*){0,2}\s+(?:Corp|Corp\.|Corporation|Solutions|Solution|Enterprises|Enterprise|Ltd|Ltd\.|Limited|Inc|Inc\.|LLC|Co|Co\.)\b/g;
  const placeholder = '__TENANT_BUSINESS_NAME__';
  // Protect the registered name first so the guards below can never mangle it.
  let guarded = reply.split(businessName).join(placeholder);
  guarded = guarded.replace(foreignNameRe, businessName);
  reply = guarded.split(placeholder).join(businessName);

  // A shortened form of the tenant name ("ROLINJ.IO" for "ROLINJ.IO - ...")
  // is upgraded to the registered business name.
  const firstWord = businessName.split(/\s+/)[0] || '';
  if (/^[A-Z][A-Za-z0-9.&'-]{2,}$/.test(firstWord) && !['The', 'Our', 'Your', 'This', 'That', 'And', 'For'].includes(firstWord)) {
    const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const shortRe = new RegExp('(?<![A-Za-z0-9&.\'-])' + escaped + '(?![A-Za-z0-9&.\'-])', 'g');
    let shortened = reply.split(businessName).join(placeholder);
    shortened = shortened.replace(shortRe, businessName);
    reply = shortened.split(placeholder).join(businessName);
  }
} else if (/\b[A-Z][A-Za-z0-9&'.\-]*(?:\s+[A-Z][A-Za-z0-9&'.\-]*){0,2}\s+(?:Corp|Corp\.|Corporation|Solutions|Solution|Enterprises|Enterprise|Ltd|Ltd\.|Limited|Inc|Inc\.|LLC|Co|Co\.)\b/.test(reply)) {
  reply = 'Let me connect you with a representative who can help.';
  escalate = true;
  if (!escalationReason) escalationReason = 'unverified_business_identity';
}
const phRe = new RegExp('\\[([^\\]]*(context|list specific|todo|placeholder|insert(\\s+\\w+){0,3}\\s+(here|from)|lorem|example\\.com|your\\s+\\w+\\s+here)[^\\]]*)\\]', 'i');
if (phRe.test(reply)) {
  reply = businessKnown
    ? 'I don\'t have those details handy - let me connect you with someone from ' + businessName + ' who can help right away.'
    : 'I don\'t have those details handy - let me connect you with a representative who can help right away.';
  escalate = true;
  if (!escalationReason) escalationReason = 'template_placeholder_leak';
  intent = 'general_inquiry';
}
const humanRe = /(live\s*person|real\s*person|human|agent|representative|someone\s+(real|there)|speak\s+to\s+(someone|a\s*(person|human|manager|agent))|talk\s+to\s+(someone|a\s*(person|human|manager|agent))|call\s+me|phone\s+me|contact\s+me|get\s+(me\s+)?(someone|a\s*(manager|supervisor|human)))/i;
if (!escalate && humanRe.test(customerMsg)) {
  escalate = true;
  if (!escalationReason) escalationReason = 'customer_requested_human';
  const greetOnly = new RegExp('^good\\s+(morning|afternoon|evening|night)\\b.*how can i help you today\\??\\s*$', 'i');
  if (greetOnly.test(reply)) {
    reply = businessKnown
      ? 'Of course - connecting you with someone from ' + businessName + ' right now.'
      : 'Of course - connecting you with a representative right now.';
  }
}
if (intent === 'general_inquiry' && !escalate) {
  if (/(appointment|book(ing)?|schedule|site\s*visit|consultation|meet(ing)?)/i.test(customerMsg)) intent = 'appointment';
  else if (/(quote|quotation|price|pricing|cost|estimate|how\s+much)/i.test(customerMsg)) intent = 'quote';
}
const str = (v) => (v === undefined || v === null ? '' : String(v));
let apptDate = str(parsed.appointment_date);
if (/^\d{4}-\d{2}-\d{2}$/.test(apptDate)) {
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const parts = apptDate.split('-').map(Number);
  const dUTC = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const dayDiff = (dUTC - todayUTC) / 86400000;
  if (dayDiff < -30 || dayDiff > 730) apptDate = '';
} else if (apptDate) {
  apptDate = '';
}
const cleanFacts = (Array.isArray(parsed.facts_extracted) ? parsed.facts_extracted : [])
  .map(function (f) {
    return {
      key: String((f && (f.key || f.fact_key)) || ''),
      value: String((f && (f.value || f.fact_value)) || ''),
      confidence: (f && f.confidence != null) ? f.confidence : 1
    };
  })
  .filter(function (f) { return f.key && f.value && ['null', 'undefined', ''].indexOf(f.key.toLowerCase()) === -1; });
return [{
  json: {
    reply: reply,
    reply_b64: Buffer.from(reply, 'utf8').toString('base64'),
    facts_extracted: cleanFacts,
    intent: intent,
    lead_stage: (typeof parsed.lead_stage === 'string' && parsed.lead_stage) ? parsed.lead_stage : 'qualifying',
    sentiment: (typeof parsed.sentiment === 'string' && parsed.sentiment) ? parsed.sentiment : 'neutral',
    escalate: escalate,
    escalation_reason: escalationReason,
    appointment_type: str(parsed.appointment_type),
    appointment_title: str(parsed.appointment_title),
    appointment_location: str(parsed.appointment_location),
    appointment_date: apptDate,
    appointment_time: str(parsed.appointment_time),
    appointment_duration: str(parsed.appointment_duration),
    quote_product: str(parsed.quote_product),
    quote_quantity: str(parsed.quote_quantity),
    conversation_id: trigger.conversation_id || '',
    contact_id: trigger.contact_id || ''
  }
}];
