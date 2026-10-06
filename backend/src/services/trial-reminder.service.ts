import { emailService } from './email.service';
import { query } from '../utils/database';
import logger from '../utils/logger';

type TrialReminderCandidate = {
  id: string;
  business_id: string;
  reminder_key: 'day7' | 'day12';
  days_remaining: number;
  email: string | null;
  name: string;
};

/** Sends each trial reminder once. A failed delivery releases its claim so the next hourly run can retry. */
export async function sendDueTrialReminders(): Promise<number> {
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
      logger.warn('Trial reminder skipped because no admin email is configured', { businessId: candidate.business_id, reminder: candidate.reminder_key });
      continue;
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

    try {
      await emailService.sendTrialReminder(candidate.email, candidate.name, candidate.business_id, candidate.days_remaining);
      await query(`
        UPDATE subscriptions
        SET metadata = jsonb_set(metadata, '{trial_reminders}',
          COALESCE(metadata->'trial_reminders', '{}'::jsonb) ||
            jsonb_build_object($2, jsonb_build_object('status', 'sent', 'sent_at', NOW())), true)
        WHERE id = $1
      `, [candidate.id, candidate.reminder_key]);
      sentCount += 1;
    } catch (error) {
      await query(`UPDATE subscriptions
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{trial_reminders}',
          COALESCE(metadata->'trial_reminders', '{}'::jsonb) - $2, true)
        WHERE id = $1`, [candidate.id, candidate.reminder_key]);
      logger.error('Trial reminder delivery failed', { businessId: candidate.business_id, reminder: candidate.reminder_key, error });
    }
  }

  return sentCount;
}
