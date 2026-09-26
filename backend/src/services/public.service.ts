import { query } from '../utils/database';
import jwt from 'jsonwebtoken';
import { hashPassword } from './auth.service';
import { createBusiness, getBusinessBySlug, getBusinessByWhatsAppPhone, Business } from './business.service';
import { createTrial } from './subscription.service';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface PublicSignupRequest {
  businessName: string;
  slug: string;
  whatsappPhone: string;
  ownerName: string;
  email: string;
  password: string;
}

export interface PublicSignupResponse {
  business: {
    id: string;
    name: string;
    slug: string;
    status: string;
    whatsapp_phone: string;
    waha_session_name: string;
    currency: string;
    timezone: string;
  };
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    businessId: string;
  };
  token: string;
  expiresIn: string;
}

const DEFAULT_SETTINGS: Array<{ key: string; value: string; dataType: string; description?: string }> = [
  { key: 'whatsapp_api_version', value: 'v18.0', dataType: 'string', description: 'WhatsApp API version' },
  { key: 'ai_model', value: 'llama-3.3-70b-versatile', dataType: 'string', description: 'Default AI model' },
  { key: 'message_limit', value: '1000', dataType: 'integer', description: 'WhatsApp messages per 24h' },
  { key: 'webhook_url', value: '', dataType: 'string', description: 'n8n webhook URL' },
  { key: 'ai_prompt', value: '', dataType: 'string', description: 'Custom AI prompt/instructions' },
  { key: 'currency', value: 'JMD', dataType: 'string', description: 'Business currency' },
  { key: 'timezone', value: 'America/Jamaica', dataType: 'string', description: 'Business timezone' },
];

export function normalizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new BadRequestError('Slug must contain alphanumeric characters');
  if (slug.length < 3) throw new BadRequestError('Slug must be at least 3 characters');
  if (slug.length > 50) throw new BadRequestError('Slug must be at most 50 characters');
  return slug;
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!/^\+?[1-9]\d{6,14}$/.test(trimmed.replace(/\s/g, ''))) {
    throw new BadRequestError('Phone number must be in E.164 format, e.g. +18765551234');
  }
  return trimmed;
}

export function validatePassword(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestError('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestError('Password must contain at least one number');
  }
}

export async function signupBusiness(data: PublicSignupRequest): Promise<PublicSignupResponse> {
  const normalizedEmail = data.email.toLowerCase().trim();
  const slug = normalizeSlug(data.slug);
  const phone = normalizePhone(data.whatsappPhone);
  const ownerName = data.ownerName.trim();
  const nameParts = ownerName.split(/\s+/);
  const firstName = nameParts[0] || 'Owner';
  const lastName = nameParts.slice(1).join(' ') || '';

  validatePassword(data.password);

  const existingSlug = await getBusinessBySlug(slug);
  if (existingSlug) {
    throw new ConflictError('Slug is already taken');
  }

  const existingPhone = await getBusinessByWhatsAppPhone(phone);
  if (existingPhone) {
    throw new ConflictError('WhatsApp phone is already registered to another business');
  }

  const existingEmail = await query<{ id: string }>(
    'SELECT id FROM staff_users WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  if (existingEmail.rows.length > 0) {
    throw new ConflictError('Email is already in use');
  }

  const sessionName = `waha-${slug}`.slice(0, 100);

  const business = await createBusiness({
    name: data.businessName.trim(),
    slug,
    whatsapp_phone: phone,
    waha_session_name: sessionName,
    currency: 'JMD',
    timezone: 'America/Jamaica',
    status: 'trialing',
  });

  try {
    await createTrial(business.id, 'starter');
  } catch (error) {
    logger.warn('Trial subscription init failed; migration backfill will cover tenant', { businessId: business.id, error });
  }

  const passwordHash = await hashPassword(data.password);

  const staffResult = await query<{
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    status: string;
    timezone: string;
    business_id: string;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO staff_users (employee_number, first_name, last_name, email, role, status, timezone, password_hash, business_id)
     VALUES ($1, $2, $3, $4, 'admin', 'active', $5, $6, $7)
     RETURNING id, employee_number, first_name, last_name, email, role, status, timezone, business_id, created_at, updated_at`,
    [`EMP-${business.id.slice(0, 6).toUpperCase()}`, firstName, lastName, normalizedEmail, 'America/Jamaica', passwordHash, business.id]
  );

  const staff = staffResult.rows[0];
  if (!staff) {
    throw new NotFoundError('Failed to create staff user');
  }

  for (const setting of DEFAULT_SETTINGS) {
    try {
      await query(
        `INSERT INTO settings (setting_key, setting_value, data_type, description, business_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (business_id, setting_key) DO NOTHING`,
        [setting.key, setting.value, setting.dataType, setting.description || null, business.id]
      );
    } catch (error) {
      logger.warn('Failed to seed setting during signup', { businessId: business.id, key: setting.key, error });
    }
  }

  const token = jwt.sign(
    {
      userId: staff.id,
      email: staff.email,
      role: staff.role,
      firstName: staff.first_name,
      lastName: staff.last_name,
      businessId: business.id,
      tenantId: business.id,
    },
    process.env.JWT_SECRET || process.env.BACKEND_JWT_SECRET || 'change_me_to_a_random_64_char_string',
    { expiresIn: '1d' }
  );

  return {
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      status: business.status,
      whatsapp_phone: business.whatsapp_phone || '',
      waha_session_name: business.waha_session_name || '',
      currency: business.currency,
      timezone: business.timezone,
    },
    user: {
      id: staff.id,
      email: staff.email,
      firstName: staff.first_name,
      lastName: staff.last_name,
      role: staff.role,
      businessId: business.id,
    },
    token,
    expiresIn: '1d',
  };
}

export async function activateBusiness(id: string, requesterBusinessId?: string, requesterRole?: string): Promise<Business> {
  const isSuperAdmin = requesterRole === 'super_admin';
  const result = await query<Business>(
    `UPDATE businesses
     SET status = 'active', updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL ${isSuperAdmin ? '' : "AND id = $2"}
     RETURNING id, name, slug, description, email, phone, website, address, currency, timezone, logo_url, whatsapp_phone, waha_session_name, status, metadata, created_at, updated_at`,
    isSuperAdmin ? [id] : [id, requesterBusinessId || '']
  );
  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Business not found');
  }
  return business;
}

export async function checkSlugAvailability(slug: string): Promise<{ available: boolean }> {
  const normalized = normalizeSlug(slug);
  const result = await query<{ id: string }>(
    'SELECT id FROM businesses WHERE slug = $1 AND deleted_at IS NULL LIMIT 1',
    [normalized]
  );
  return { available: result.rows.length === 0 };
}

export async function checkPhoneAvailability(phone: string): Promise<{ available: boolean }> {
  const normalized = normalizePhone(phone);
  const result = await query<{ id: string }>(
    "SELECT id FROM businesses WHERE whatsapp_phone = $1 AND deleted_at IS NULL AND status IN ('active', 'pending') LIMIT 1",
    [normalized]
  );
  return { available: result.rows.length === 0 };
}
