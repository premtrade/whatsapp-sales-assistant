import { emailService } from './email.service';
import { query } from '../utils/database';
import logger from '../utils/logger';
import { resolveBillingContact, toChatId } from './billing/notification.service';
import { sendWahaText } from './waha.service';

type TrialReminderCandidate = {
  id: string;
  business_id: string;
  reminder_key: 'day7' | 'day12';
  days_remaining: number;
  email: string | null;
  name: string;
};

/**
 * Delivers a trial reminder.
 *
 * Email is the channel the customer gave us at signup, so it goes first. But
 * the platform cannot always send email: the mail provider may have no key,
 * or the outbound relay may be blocked, and a trial reminder that silently
 * fails is a prospect who never hears from us.
 *
 * WhatsApp is the fallback, for the same reason the payment request prefers
 * it: the owner is holding the phone, the platform already holds a WhatsApp
 * connection for their tenant, and a message on WhatsApp costs a fraction of
 * an email.
 */
export async function deliverTrialReminder(
  candidate: TrialReminderCandidate
): Promise<'email' | 'whatsapp' | 'none'> {
  if (candidate.email) {
    try {
      await emailService.sendTrialReminder(
        candidate.email,
        candidate.name,
        candidate.business_id,
        candidate.days_remaining
      );
      return 'email';
    } catch (error) {
      logger.warn('Trial reminder email failed, trying WhatsApp', {
        businessId: candidate.business_id,
        reminder: candidate.reminder_key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const contact = await resolveBillingContact(candidate.business_id);
  if (contact.phone && contact.session) {
    try {
      await sendWahaText({
        session: contact.session,
        chatId: toChatId(contact.phone),
        text:
          `Hi ${contact.name},\n\n` +
          `Your WAFLO trial ends in about ${candidate.days_remaining} days. ` +
          `Open the Billing page in your dashboard to review your plan and keep your WhatsApp workflows running.\n\n` +
          `— WAFLO`,
      });
      return 'whatsapp';
    } catch (error) {
      logger.warn('Trial reminder WhatsApp delivery failed', {
        businessId: candidate.business_id,
        reminder: candidate.reminder_key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return 'none';
}

/**
 * Sends each trial reminder once. A failed delivery releases its claim so the next hourly run can retry.
 *
 * The reminder windows are narrow - a trial is only reminded when it has seven
 * days left and when it has two. If delivery fails for the whole of a window
 * the reminder is lost, so a tenant about to fall out of its trial is also
 * reported to the platform owner in the logs. A trial that expires silently is
 * a prospect that never heard from us.
 */
export async function sendDueTrialReminders(): Promise<number> {
  const expiring = await query<{ slug: string; email: string | null; days_left: number }>(`
    SELECT b.slug, b.email, EXTRACT(DAY FROM (s.trial_ends_at - NOW()))::int AS days_left
      FROM subscriptions s
      JOIN businesses b ON b.id = s.business_id
     WHERE s.status = 'trialing'
       AND s.trial_ends_at > NOW()
       AND s.trial_ends_at <= NOW() + INTERVAL '3 days'
       AND COALESCE(b.metadata->>'is_demo', 'false') <> 'true'
     ORDER BY s.trial_ends_at
  `);

  if (expiring.rows.length > 0) {
    logger.warn(
      'Trials are about to expire. If no reminder has been delivered, check that EMAIL_PROVIDER is configured and its key is set.',
      {
        trials: expiring.rows.map((t) => ({
          slug: t.slug,
          email: t.email,
          daysLeft: t.days_left,
        })),
      }
    );
  }

  const candidates = await query<TrialReminderCandidate>(`
    SELECT s.id, s.business_id, b.name,
      CASE WHEN s.trial_ends_at > NOW() + INTERVAL '6 days' THEN 'day7' ELSE 'day12' END AS reminder_key,
      CASE WHEN s.trial_ends_at > NOW() + INTERVAL '6 days' THEN 7 ELSE 2 END AS days_remaining,
      COALESCE(
        (SELECT su.email FROM staff_users su
         WHERE su.business_id = s.business_id AND su.status = 'active'
           AND su.deleted_at IS NULL
           AND su.role IN ('admin', 'manager') AND su.email IS NOT NULL
         ORDER BY (su.role = 'admin') DESC, su.created_at ASC LIMIT 1),
        b.email
      ) AS email
    FROM subscriptions s
    JOIN businesses b ON b.id = s.business_id
    WHERE s.status = 'trialing'
      AND s.trial_ends_at > NOW()
      -- The demo tenant is not a real prospect. It would otherwise generate
      -- trial reminders addressed to our own inbox.
      AND COALESCE(b.metadata->>'is_demo', 'false') <> 'true'
      AND ((s.trial_ends_at > NOW() + INTERVAL '6 days' AND s.trial_ends_at <= NOW() + INTERVAL '7 days')
        OR (s.trial_ends_at > NOW() + INTERVAL '1 day' AND s.trial_ends_at <= NOW() + INTERVAL '2 days'))
      AND (
        COALESCE(s.metadata #>> ARRAY['trial_reminders',
          CASE WHEN s.trial_ends_at > NOW() + INTERVAL '6 days' THEN 'day7' ELSE 'day12' END], '') = ''
        OR (
          s.metadata #>> ARRAY['trial_reminders',
            CASE WHEN s.trial_ends_at > NOW() + INTERVAL '6 days' THEN 'day7' ELSE 'day12' END, 'status'] = 'sending'
          AND NULLIF(s.metadata #>> ARRAY['trial_reminders',
            CASE WHEN s.trial_ends_at > NOW() + INTERVAL '6 days' THEN 'day7' ELSE 'day12' END, 'claimed_at'], '')::timestamptz
            < NOW() - INTERVAL '30 minutes'
        )
      )
  `);

  let sentCount = 0;
  for (const candidate of candidates.rows) {
    if (!candidate.email) {
      logger.warn('Trial reminder has no admin email; it will be sent over WhatsApp if the tenant has a number on file', {
        businessId: candidate.business_id,
        reminder: candidate.reminder_key,
      });
    }

    const claim = await query<{ id: string }>(`
      UPDATE subscriptions
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{trial_reminders}',
        COALESCE(metadata->'trial_reminders', '{}'::jsonb) ||
          jsonb_build_object($2, jsonb_build_object('status', 'sending', 'claimed_at', NOW())), true)
      WHERE id = $1 AND status = 'trialing'
        AND (
          COALESCE(metadata #>> ARRAY['trial_reminders', $2], '') = ''
          OR (
            metadata #>> ARRAY['trial_reminders', $2, 'status'] = 'sending'
            AND NULLIF(metadata #>> ARRAY['trial_reminders', $2, 'claimed_at'], '')::timestamptz
              < NOW() - INTERVAL '30 minutes'
          )
        )
      RETURNING id
    `, [candidate.id, candidate.reminder_key]);
    if (!claim.rowCount) continue;

    const channel = await deliverTrialReminder(candidate);
    if (channel === 'none') {
      // Release the claim so the next hourly run tries again, and say why:
      // a trial that expires silently is a prospect who never heard from us.
      await query(`UPDATE subscriptions
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{trial_reminders}',
          COALESCE(metadata->'trial_reminders', '{}'::jsonb) - $2, true)
        WHERE id = $1`, [candidate.id, candidate.reminder_key]);
      logger.error('Trial reminder could not be delivered by any channel', {
        businessId: candidate.business_id,
        reminder: candidate.reminder_key,
      });
      continue;
    }

    await query(`
      UPDATE subscriptions
      SET metadata = jsonb_set(metadata, '{trial_reminders}',
        COALESCE(metadata->'trial_reminders', '{}'::jsonb) ||
          jsonb_build_object($2, jsonb_build_object('status', 'sent', 'sent_at', NOW(), 'channel', $3)), true)
      WHERE id = $1
    `, [candidate.id, candidate.reminder_key, channel]);
    logger.info('Trial reminder sent', {
      businessId: candidate.business_id,
      reminder: candidate.reminder_key,
      channel,
    });
    sentCount += 1;
  }

  return sentCount;
}
