const trigger = $('When Executed by Another Workflow').first()?.json || {};
let stageUpdate = {};
try { stageUpdate = $('Update Conversation Stage').first()?.json || {}; } catch (e) {}
let handoff = {};
try { handoff = $('Call Handoff Tool').first()?.json || {}; } catch (e) {}

return [{
  json: {
    success: true,
    conversation_id: trigger.conversation_id,
    contact_id: trigger.contact_id,
    lead_stage: trigger.lead_stage,
    intent: trigger.intent,
    sentiment: trigger.sentiment,
    escalate: !!trigger.escalate,
    conversation_stage_updated: !!stageUpdate.id,
    handoff_triggered: !!handoff.success,
    handoff_reason: handoff.success ? trigger.escalation_reason : null,
  }
}];