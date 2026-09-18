const input = $('When Executed by Another Workflow').first()?.json || {};
const message = (input.message || '').trim();
let name = null;

// Multiple patterns to catch various name introduction formats
const patterns = [
  /\bmy\s+name\s+is\s+([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF'\-\s]{1,80})/i,
  /\bi'?m\s+([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF'\-\s]{1,80})/i,
  /\bthis\s+is\s+([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF'\-\s]{1,80})/i,
  /\bcall\s+me\s+([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF'\-\s]{1,80})/i,
  /\bname'?s\s+([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF'\-\s]{1,80})/i
];

for (const pattern of patterns) {
  const match = message.match(pattern);
  if (match) {
    name = match[1].trim().replace(/[.,!?;:]+$/, '').trim();
    break;
  }
}

return [{
  json: {
    conversation_id: input.conversation_id,
    contact_id: input.contact_id,
    phone: input.phone,
    message: input.message,
    message_id: input.message_id,
    customer_name: name
  }
}];