/**
 * Repairs tenants that were created without a subscription.
 *
 * A self-serve signup creates the business, then the trial subscription. If
 * the subscription insert failed - as it did between 1 and 15 October 2026,
 * when the ON CONFLICT clause could not be matched against the partial unique
 * index added in migration 056 - the business row was left behind with no
 * plan, no limits and no entitlements. Every dashboard call was gated with a
 * 402, and because businesses.whatsapp_phone is unique the customer could not
 * sign up again either.
 *
 *   npm run repair:tenants              report and repair
 *   npm run repair:tenants -- --dry-run report only
 *
 * Repairs:
 *   - creates the missing trial subscription on the starter plan
 *   - backfills any settings rows the tenant is missing
 *
 * The trial starts from now, so a tenant that lost days to the bug is not
 * punished for it.
 */
import 'dotenv/config';
import { query } from '../utils/database';
import { createTrial } from '../services/subscription.service';
import { DEFAULT_SETTINGS } from '../services/public.service';
import { closePool } from '../utils/database';
import logger from '../utils/logger';

type BrokenTenant = {
  id: string;
  slug: string;
  name: string;
  status: string;
  whatsapp_phone: string | null;
  created_at: Date;
  staff_count: string;
  settings_count: string;
};

const dryRun = process.argv.includes('--dry-run');

async function findBrokenTenants(): Promise<BrokenTenant[]> {
  const result = await query<BrokenTenant>(
    `SELECT b.id, b.slug, b.name, b.status, b.whatsapp_phone, b.created_at,
            (SELECT count(*) FROM staff_users s WHERE s.business_id = b.id) AS staff_count,
            (SELECT count(*) FROM settings st WHERE st.business_id = b.id) AS settings_count
       FROM businesses b
      WHERE NOT EXISTS (
        SELECT 1 FROM subscriptions sub WHERE sub.business_id = b.id
      )
      ORDER BY b.created_at`
  );
  return result.rows;
}

async function backfillSettings(businessId: string): Promise<number> {
  const existing = await query<{ setting_key: string }>(
    'SELECT setting_key FROM settings WHERE business_id = $1',
    [businessId]
  );
  const have = new Set(existing.rows.map((r) => r.setting_key));
  const missing = DEFAULT_SETTINGS.filter((s) => !have.has(s.key));
  if (missing.length === 0) return 0;

  for (const setting of missing) {
    await query(
      `INSERT INTO settings (setting_key, setting_value, data_type, description, business_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (business_id, setting_key) DO NOTHING`,
      [setting.key, setting.value, setting.dataType, setting.description || null, businessId]
    );
  }
  return missing.length;
}

async function main() {
  const broken = await findBrokenTenants();

  if (broken.length === 0) {
    process.stdout.write('Every tenant has a subscription. Nothing to repair.\n');
    return;
  }

  process.stdout.write(`\nFound ${broken.length} tenant(s) without a subscription:\n\n`);
  for (const tenant of broken) {
    process.stdout.write(
      `  ${tenant.slug}\n` +
        `    name       : ${tenant.name}\n` +
        `    signed up  : ${tenant.created_at.toISOString().slice(0, 10)}\n` +
        `    whatsapp   : ${tenant.whatsapp_phone || '(none)'}\n` +
        `    staff      : ${tenant.staff_count}\n` +
        `    settings   : ${tenant.settings_count}\n`
    );

    if (dryRun) {
      process.stdout.write('    [dry run] would create a starter trial and backfill settings\n\n');
      continue;
    }

    try {
      const subscription = await createTrial(tenant.id, 'starter');
      const added = await backfillSettings(tenant.id);
      process.stdout.write(
        `    repaired   : trial on the ${subscription.plan?.slug || 'starter'} plan, ` +
          `ends ${subscription.trial_ends_at ? new Date(subscription.trial_ends_at).toISOString().slice(0, 10) : 'n/a'}` +
          `${added ? `, ${added} setting(s) backfilled` : ''}\n\n`
      );
    } catch (err) {
      process.stdout.write(
        `    FAILED     : ${err instanceof Error ? err.message : String(err)}\n\n`
      );
    }
  }

  if (!dryRun) {
    logger.info('Tenant repair finished', { repaired: broken.length });
  }
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    process.stderr.write(`Repair failed: ${error?.stack || error}\n`);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
