import { query, transaction } from '../utils/database';
import logger from '../utils/logger';
import { BadRequestError, ConflictError } from '../utils/errors';
import { hashPassword } from './auth.service';

/**
 * Item 3 — Self-serve signup flow.
 * Creates business (workspace) + owner staff user + trialing subscription +
 * entitlements in one transaction. Trial length comes from the plan row
 * (defaults to the 14-day promise on the landing page).
 */

export interface SignupRequest {
  businessName: string;
  ownerFirstName: string;
  ownerLastName: string;
  email: string;
  password: string;
  planCode?: string; // 'starter' | 'professional' | 'business'
}

export interface SignupResult {
  businessId: string;
  userId: string;
  subscriptionId: string;
  planCode: string;
  trialEndsAt: Date;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export async function signup(req: SignupRequest): Promise<SignupResult> {
  const email = req.email.toLowerCase().trim();

  if (!req.businessName || req.businessName.trim().length < 2) {
    throw new BadRequestError('Business name is required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError('A valid email is required');
  }
  if (!req.password || req.password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters');
  }

  const planCode = (req.planCode || 'starter').toLowerCase();
  const planResult = await query<{
    id: string;
    code: string;
    trial_days: number;
    ai_responses_per_period: number | null;
    max_staff_users: number | null;
    max_locations: number | null;
  }>(
    `SELECT id, code, trial_days, ai_responses_per_period, max_staff_users, max_locations
     FROM plans WHERE code = $1 AND is_public = TRUE`,
    [planCode]
  );
  const plan = planResult.rows[0];
  if (!plan) throw new BadRequestError(`Unknown plan: ${planCode}`);

  const baseSlug = slugify(req.businessName) || 'workspace';
  const slugResult = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM businesses WHERE slug = $1 OR slug LIKE $2`,
    [baseSlug, `${baseSlug}-%`]
  );
  const n = parseInt(slugResult.rows[0]?.n || '0', 10);
  const slug = n === 0 ? baseSlug : `${baseSlug}-${n + 1}`;

  const passwordHash = await hashPassword(req.password);
  const trialDays = plan.trial_days ?? 14;

  const result = await transaction(async (client) => {
    const bizRes = await client.query<{ id: string }>(
      `INSERT INTO businesses (name, slug, status, metadata)
       VALUES ($1, $2, 'active', $3)
       RETURNING id`,
      [req.businessName.trim(), slug, { source: 'self_serve_signup' }]
    );
    const businessId = bizRes.rows[0]!.id;

    const empRes = await client.query<{ total: string }>(
      `SELECT COALESCE(MAX(NULLIF(SUBSTRING(employee_number FROM 4), '')::int), 0) + 1 AS total
       FROM staff_users WHERE employee_number LIKE 'EMP%'`
    );
    const employeeNumber = `EMP${String(parseInt(empRes.rows[0]?.total || '1', 10)).padStart(3, '0')}`;

    const existing = await client.query(
      `SELECT id FROM staff_users WHERE email = $1`,
      [email]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('An account with this email already exists');
    }

    const userRes = await client.query<{ id: string }>(
      `INSERT INTO staff_users
         (employee_number, first_name, last_name, display_name, email, role, status,
          timezone, business_id, password_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, 'admin', 'active', 'America/Jamaica', $6, $7, $8)
       RETURNING id`,
      [
        employeeNumber,
        req.ownerFirstName.trim(),
        req.ownerLastName.trim(),
        `${req.ownerFirstName.trim()} ${req.ownerLastName.trim()}`,
        email,
        businessId,
        passwordHash,
        { created_via: 'signup' },
      ]
    );
    const userId = userRes.rows[0]!.id;

    const subRes = await client.query<{ id: string; trial_end_at: Date }>(
      `INSERT INTO subscriptions
         (business_id, plan_id, status, trial_start_at, trial_end_at, current_period_start, metadata)
       VALUES ($1, $2, 'trialing', NOW(), NOW() + ($3 || ' days')::interval, NOW(), $4)
       RETURNING id, trial_end_at`,
      [businessId, plan.id, String(trialDays), { signup_email: email }]
    );
    const subscriptionId = subRes.rows[0]!.id;
    const trialEndsAt = subRes.rows[0]!.trial_end_at;

    await client.query(
      `INSERT INTO entitlements
         (subscription_id, ai_responses_per_period, max_staff_users, max_locations)
       VALUES ($1, $2, $3, $4)`,
      [subscriptionId, plan.ai_responses_per_period, plan.max_staff_users, plan.max_locations]
    );

    return { businessId, userId, subscriptionId, trialEndsAt };
  });

  logger.info('Signup completed', {
    businessId: result.businessId,
    userId: result.userId,
    planCode: plan.code,
    trialEndsAt: result.trialEndsAt,
  });

  // TODO(beta ops): send welcome email with login link once SMTP is wired up.

  return {
    businessId: result.businessId,
    userId: result.userId,
    subscriptionId: result.subscriptionId,
    planCode: plan.code,
    trialEndsAt: result.trialEndsAt,
  };
}
