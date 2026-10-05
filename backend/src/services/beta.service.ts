import { query } from '../utils/database';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import logger from '../utils/logger';

export interface BetaInvite {
  id: string;
  email?: string | null;
  domain?: string | null;
  token: string;
  invite_type: 'email' | 'domain' | 'promo';
  max_uses: number;
  used_count: number;
  expires_at?: Date | null;
  created_by?: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface BetaStatus {
  open: boolean;
  waitlistUrl?: string;
  estimatedLaunch?: string;
  remainingPromoCodes?: number;
}

export interface BetaRegistration {
  id: string;
  business_id?: string | null;
  email: string;
  invite_token?: string | null;
  invite_type?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  signed_up_at: Date;
}

function rowToBetaInvite(row: unknown): BetaInvite {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    email: r.email ? String(r.email) : null,
    domain: r.domain ? String(r.domain) : null,
    token: String(r.token),
    invite_type: String(r.invite_type) as BetaInvite['invite_type'],
    max_uses: Number(r.max_uses),
    used_count: Number(r.used_count),
    expires_at: r.expires_at ? new Date(String(r.expires_at)) : null,
    created_by: r.created_by ? String(r.created_by) : null,
    metadata: (r.metadata as Record<string, unknown>) || {},
    created_at: new Date(String(r.created_at)),
    updated_at: new Date(String(r.updated_at)),
  };
}

export async function isBetaOpen(): Promise<boolean> {
  const result = await query<{ value: string }>(
    `SELECT setting_value FROM settings WHERE setting_key = 'beta_open' AND business_id IS NULL LIMIT 1`
  );
  return result.rows[0]?.value !== 'false';
}

export async function setBetaOpen(open: boolean): Promise<void> {
  await query(
    `INSERT INTO settings (setting_key, setting_value, data_type, description, business_id)
     VALUES ('beta_open', $1, 'boolean', 'Whether the public beta is open for signups', NULL)
     ON CONFLICT (business_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
    [open ? 'true' : 'false']
  );
}

export async function getBetaStatus(): Promise<BetaStatus> {
  const open = await isBetaOpen();
  const waitlistResult = await query<{ value: string }>(
    `SELECT setting_value FROM settings WHERE setting_key = 'beta_waitlist_url' AND business_id IS NULL LIMIT 1`
  );
  const launchResult = await query<{ value: string }>(
    `SELECT setting_value FROM settings WHERE setting_key = 'beta_estimated_launch' AND business_id IS NULL LIMIT 1`
  );
  const promoResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM beta_invites WHERE invite_type = 'promo' AND (expires_at IS NULL OR expires_at > NOW())`
  );

  return {
    open,
    waitlistUrl: waitlistResult.rows[0]?.value || undefined,
    estimatedLaunch: launchResult.rows[0]?.value || undefined,
    remainingPromoCodes: open ? undefined : Number(promoResult.rows[0]?.count || 0),
  };
}

export async function validateBetaInvite(
  email: string,
  token?: string
): Promise<{ valid: boolean; inviteType?: string; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const domain = normalizedEmail.split('@')[1]?.toLowerCase();

  // If no token provided, check if there is an open domain or promo invite.
  let invite: BetaInvite | null = null;

  if (token) {
    const result = await query<BetaInvite>(
      `SELECT id, email, domain, token, invite_type, max_uses, used_count, expires_at, created_by, metadata, created_at, updated_at
       FROM beta_invites
       WHERE token = $1
       LIMIT 1`,
      [token]
    );
    invite = result?.rows?.[0] ? rowToBetaInvite(result.rows[0]) : null;
  } else {
    // Check for domain invite.
    if (domain) {
      const result = await query<BetaInvite>(
        `SELECT id, email, domain, token, invite_type, max_uses, used_count, expires_at, created_by, metadata, created_at, updated_at
         FROM beta_invites
         WHERE invite_type = 'domain' AND domain = $1
         LIMIT 1`,
        [domain]
      );
      invite = result?.rows?.[0] ? rowToBetaInvite(result.rows[0]) : null;
    }

    // Check for open promo code (first active one).
    if (!invite) {
      const result = await query<BetaInvite>(
        `SELECT id, email, domain, token, invite_type, max_uses, used_count, expires_at, created_by, metadata, created_at, updated_at
         FROM beta_invites
         WHERE invite_type = 'promo' AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at ASC
         LIMIT 1`,
        []
      );
      invite = result?.rows?.[0] ? rowToBetaInvite(result.rows[0]) : null;
    }
  }

  if (!invite) {
    return { valid: false, error: 'No valid beta invite found for this email or token.' };
  }

  if (invite.invite_type === 'email' && invite.email && invite.email.toLowerCase() !== normalizedEmail) {
    return { valid: false, error: 'This invite is tied to a different email address.' };
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    return { valid: false, error: 'This beta invite has expired.' };
  }

  if (invite.used_count >= invite.max_uses) {
    return { valid: false, error: 'This beta invite has reached its usage limit.' };
  }

  return { valid: true, inviteType: invite.invite_type };
}

export async function recordBetaRegistration(data: {
  businessId?: string;
  email: string;
  inviteToken?: string;
  inviteType?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<BetaRegistration> {
  const result = await query<BetaRegistration>(
    `INSERT INTO beta_registrations (business_id, email, invite_token, invite_type, ip_address, user_agent, signed_up_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, business_id, email, invite_token, invite_type, ip_address, user_agent, signed_up_at`,
    [
      data.businessId || null,
      data.email.toLowerCase().trim(),
      data.inviteToken || null,
      data.inviteType || null,
      data.ipAddress || null,
      data.userAgent || null,
    ]
  );
  return result.rows[0] as BetaRegistration;
}

export async function consumeBetaInvite(token: string): Promise<void> {
  await query(
    `UPDATE beta_invites SET used_count = used_count + 1, updated_at = NOW() WHERE token = $1`,
    [token]
  );
}

export async function createBetaInvite(data: {
  email?: string;
  domain?: string;
  token: string;
  inviteType: 'email' | 'domain' | 'promo';
  maxUses?: number;
  expiresAt?: Date;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<BetaInvite> {
  const result = await query<BetaInvite>(
    `INSERT INTO beta_invites (email, domain, token, invite_type, max_uses, expires_at, created_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, email, domain, token, invite_type, max_uses, used_count, expires_at, created_by, metadata, created_at, updated_at`,
    [
      data.email || null,
      data.domain || null,
      data.token,
      data.inviteType,
      data.maxUses || 1,
      data.expiresAt || null,
      data.createdBy || null,
      JSON.stringify(data.metadata || {}),
    ]
  );
  return rowToBetaInvite(result.rows[0]);
}

export async function listBetaInvites(options?: { type?: string; activeOnly?: boolean }): Promise<BetaInvite[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.type) {
    conditions.push(`invite_type = $${idx++}`);
    params.push(options.type);
  }
  if (options?.activeOnly) {
    conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
    conditions.push(`used_count < max_uses`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query<BetaInvite>(
    `SELECT id, email, domain, token, invite_type, max_uses, used_count, expires_at, created_by, metadata, created_at, updated_at
     FROM beta_invites
     ${where}
     ORDER BY created_at DESC`,
    params
  );
  return result.rows.map(rowToBetaInvite);
}

export async function revokeBetaInvite(token: string): Promise<void> {
  await query(`UPDATE beta_invites SET max_uses = used_count, updated_at = NOW() WHERE token = $1`, [token]);
}
