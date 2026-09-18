const input = $('When Executed by Another Workflow').first()?.json || {};
const reason = input.reason || 'Customer requested human agent support';
const assignedToRaw = input.assigned_to;
let assignedTo = null;
if (assignedToRaw && typeof assignedToRaw === 'string') {
  const trimmed = assignedToRaw.trim().toLowerCase();
  const validUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (validUuidPattern.test(assignedToRaw.trim()) && !trimmed.includes('null') && trimmed.length > 30) {
    assignedTo = assignedToRaw.trim();
  } else if (['unassigned', 'none', 'n/a', 'null', ''].includes(trimmed)) {
    assignedTo = null;
  }
}
const conversationId = input.conversation_id || null;
if (!conversationId) { return [{ json: { success: false, message: 'Handoff could not be completed: missing conversation reference.', handoff_details: { status: 'failed', reason } } }]; }
return [{ json: { conversation_id: conversationId, contact_id: input.contact_id, reason, assigned_to: assignedTo, request_id: input.request_id, phone: input.phone } }];