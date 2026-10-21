/**
 * Patches "09 - Appointment Reminders" in workflows/.
 *
 * Three bugs, all in how reminders are selected and recorded.
 *
 * 1. Reminders repeated every 30 minutes. "Mark Reminder Sent" mapped its
 *    parameter to $json.id, but by that point $json is WAHA's HTTP response,
 *    which has no id - so the UPDATE matched no rows, reminder_sent stayed
 *    false, and the same appointment was picked up again on the next tick.
 *
 * 2. The reminder time was rendered in the n8n container's timezone (UTC)
 *    rather than the business's, so a Jamaica business was told "tomorrow at
 *    4:00 PM" for an appointment at 11:00 AM local.
 *
 * 3. There are three reminder types (48h, 24h, 2h) but only one boolean, so
 *    an appointment could only ever receive one of them. Reminders are now
 *    tracked per type in appointments.metadata.reminders.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '..', 'workflows', '09 - Appointment Reminders.json');

const raw = readFileSync(path, 'utf8');
const parsed = JSON.parse(raw);
const wf = Array.isArray(parsed) ? parsed[0] : parsed;

const node = (name) => {
  const found = wf.nodes.find((n) => n.name === name);
  if (!found) throw new Error(`node not found: ${name}`);
  return found;
};

// --- 1. only select appointments whose applicable reminder is still due ----
node('Find Upcoming Appointments').parameters.query = `
SELECT a.id, a.title, a.location, a.starts_at, a.ends_at, a.reminder_sent, a.conversation_id, c.display_name, c.phone, c.email, c.id as contact_id, c.business_id, b.waha_session_name, b.timezone AS business_timezone
  FROM appointments a
  JOIN contacts c ON a.contact_id = c.id
  JOIN businesses b ON b.id = c.business_id
 WHERE a.status IN ('scheduled', 'confirmed')
   AND a.starts_at > NOW()
   AND a.starts_at <= NOW() + INTERVAL '48 hours'
   AND COALESCE(a.metadata #>> ARRAY['reminders',
        CASE
          WHEN a.starts_at <= NOW() + INTERVAL '2 hours' THEN '2h'
          WHEN a.starts_at <= NOW() + INTERVAL '24 hours' THEN '24h'
          ELSE '48h'
        END], '') = ''
 ORDER BY a.starts_at ASC
 LIMIT 20;
`.trim();

// --- 2. render the time in the business's own timezone ---------------------
node('Format Reminder Message').parameters.jsCode = `const items = $input.all();
const now = new Date();
return items.map(item => {
  const startTime = new Date(item.json.starts_at);
  const hoursUntil = Math.round((startTime - now) / (1000 * 60 * 60));
  const timeZone = item.json.business_timezone || 'America/Jamaica';
  const timeLabel = startTime.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', timeZone});
  const dateLabel = startTime.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric', timeZone});
  let reminderType = '48h';
  let message = '';
  const name = item.json.display_name || 'there';

  if (hoursUntil <= 2) {
    reminderType = '2h';
    message = \`Hi \${name}, this is a friendly reminder that your appointment with us is in 2 hours at \${timeLabel}. Please ensure the site is accessible. See you soon!\`;
  } else if (hoursUntil <= 24) {
    reminderType = '24h';
    message = \`Hello \${name}, just a reminder that your appointment with us is tomorrow at \${timeLabel}. We look forward to meeting with you!\`;
  } else {
    reminderType = '48h';
    message = \`Hello \${name}, this is a friendly reminder that you have an appointment with us on \${dateLabel} at \${timeLabel}. We look forward to meeting with you!\`;
  }

  return {
    json: {
      ...item.json,
      reminder_type: reminderType,
      message,
      hours_until: hoursUntil
    }
  };
});`;

// --- 3. record the reminder against the appointment, per type -------------
node('Mark Reminder Sent').parameters.query = `
UPDATE appointments
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reminders}',
         COALESCE(metadata->'reminders', '{}'::jsonb) ||
           jsonb_build_object($2::text, jsonb_build_object('status', 'sent', 'sent_at', NOW())), true),
       reminder_sent = TRUE,
       updated_at = NOW()
 WHERE id = NULLIF($1, '')::uuid
 RETURNING id;
`.trim();

// The appointment id has to come from the appointment row. By this point in
// the flow $json is WAHA's HTTP response, which has no id at all.
node('Mark Reminder Sent').parameters.options.queryReplacement =
  "={{ [String(($('Format Reminder Message').item.json.id) ?? ''), String(($('Format Reminder Message').item.json.reminder_type) ?? '')] }}";

node('Audit Log').parameters.options.queryReplacement =
  "={{ [String(($('Format Reminder Message').item.json.id) ?? ''), String(('Automated ' + $('Format Reminder Message').item.json.reminder_type + ' reminder sent for appointment: ' + $('Format Reminder Message').item.json.title) ?? ''), String(($('Format Reminder Message').item.json.reminder_type) ?? ''), String(($('Format Reminder Message').item.json.title) ?? ''), String(($('Format Reminder Message').item.json.contact_id) ?? '')] }}";

writeFileSync(path, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('patched 09 - Appointment Reminders');
