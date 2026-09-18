#!/usr/bin/env python3
"""Patch Workflow 2 - AI Brain.json: clean Parse AI Output + strengthen Agent prompt."""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(REPO, "workflows", "Workflow 2 - AI Brain.json")

PARSE_AI_OUTPUT = r"""const input = $input.first()?.json || {};
const rawValue = input.output || input.text || input.content || '';
const raw = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
let parsed;
try {
  parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
} catch {
  parsed = { reply: raw.trim() };
}

const trigger = $('When Executed by Another Workflow').first()?.json || {};
const businessName = String($('Format Context').first()?.json?.business_name || 'our company');

let reply = typeof parsed.reply === 'string' ? parsed.reply : String(raw).trim();

// Guard: if the AI echoed unresolved template syntax from context, fall back to a greeting.
if (/{{|\$json|\$node|\$env/.test(reply)) {
  reply = 'Good afternoon! You\'re speaking with ' + businessName + '. How can I help you today?';
}

const cleanFacts = (Array.isArray(parsed.facts_extracted) ? parsed.facts_extracted : [])
  .map(f => ({
    key: String((f && (f.key || f.fact_key)) || ''),
    value: String((f && (f.value || f.fact_value)) || ''),
    confidence: f && f.confidence != null ? f.confidence : 1
  }))
  .filter(f => f.key && f.value && !['null', 'undefined', ''].includes(f.key.toLowerCase()));

return [{
  json: {
    reply,
    facts_extracted: cleanFacts,
    intent: typeof parsed.intent === 'string' ? parsed.intent : 'general_inquiry',
    lead_stage: typeof parsed.lead_stage === 'string' ? parsed.lead_stage : 'qualifying',
    sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
    escalate: !!parsed.escalate,
    escalation_reason: typeof parsed.escalation_reason === 'string' ? parsed.escalation_reason : '',
    conversation_id: trigger.conversation_id || '',
    contact_id: trigger.contact_id || ''
  }
}];"""

AI_AGENT_SYSTEM = r"""You are a WhatsApp sales assistant for {{ $json.business_name || 'Garco Construction Services' }} (Kingston, Jamaica).

=== CONTEXT (authoritative) ===
{{ $json.formattedPrompt }}

=== RECENT CONVERSATION ===
{{ $json.conversationHistory || 'No previous messages.' }}

=== CUSTOMER FACTS (remember for next turns) ===
{{ JSON.stringify($json.customerFacts || []) }}

Today's greeting word: {{ $json.time_greeting || 'evening' }}.

RULES:
1. On a FIRST message, reply exactly: "Good {{ $json.time_greeting || 'evening' }}! You're speaking with {{ $json.business_name || 'Garco Construction Services' }}. How can I help you today?" Do not add more on a greeting.
2. Answer ONLY from CONTEXT. If CONTEXT lacks the answer, briefly say so and offer to connect with a representative, then call the Handoff Tool. Never fabricate prices, hours, people, exact addresses, services, or project details.
3. Never echo or quote internal guidance text (anything saying "AI MUST NOT", "INTERNAL", "Do not invent", "should be confirmed", or the labels "CUSTOMER FACTS"/"AUTHORITATIVE" prefixes). Rephrase in your own words.
4. For appointment / site-visit / scheduling requests: call the Appointment Tool ONCE and stop. If a required detail (project location, date, or time) is missing, ask the customer for it - never guess. Only confirm "I've scheduled your appointment..." when the tool reports success:true; otherwise ask for the missing detail.
5. For quote / price / estimate questions: use the Quote Tool only when CONTEXT has an authoritative price; otherwise say quotes are customized after reviewing scope and offer a human. Do NOT hand off pricing questions.
6. If the customer explicitly asks to speak to a person, a manager, or raises a complaint, call the Handoff Tool.
7. Replies: 1-2 concise sentences.
8. Output only compact JSON (no markdown): {"reply":"...","facts_extracted":[],"intent":"general_inquiry","lead_stage":"qualifying","sentiment":"neutral","escalate":false,"escalation_reason":""}. No other keys."""


def find_node(wf, name):
    for n in wf.get("nodes", []):
        if n.get("name") == name:
            return n
    raise SystemExit(f"node not found: {name}")


def main():
    wf = json.load(open(PATH, encoding="utf-8"))
    p = find_node(wf, "Parse AI Output")
    p["parameters"]["jsCode"] = PARSE_AI_OUTPUT
    ag = find_node(wf, "AI Agent")
    ag["parameters"]["options"]["systemMessage"] = AI_AGENT_SYSTEM
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("patched", PATH)


if __name__ == "__main__":
    main()
