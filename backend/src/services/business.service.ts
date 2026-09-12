import { query } from '../utils/database';
import { NotFoundError } from '../utils/errors';

export interface Business {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  logo_url: string | null;
  whatsapp_phone: string | null;
  waha_session_name: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BusinessCreateRequest {
  name: string;
  slug: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  currency?: string;
  timezone?: string;
  whatsapp_phone?: string;
  waha_session_name?: string;
}

export async function getBusinesses(): Promise<Business[]> {
  const result = await query<Business>(
    `SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
     FROM businesses
     WHERE deleted_at IS NULL AND status = 'active'
     ORDER BY name ASC`
  );
  return result.rows;
}

export async function getBusinessById(id: string): Promise<Business> {
  const result = await query<Business>(
    `SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logosapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
     FROM businesses
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Business not found');
  }
  return business;
}

export async function getBusinessBySlug(slug: string): Promise<Business> {
  const result = await query<Business>(
    `SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
     FROM businesses
     WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  );

  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Business not found');
  }
  return business;
}

export async function getBusinessByWhatsAppPhone(phone: string): Promise<Business | null> {
  const result = await query<Business>(
    `SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
     FROM businesses
     WHERE whatsapp_phone = $1 AND deleted_at IS NULL AND status = 'active'`,
    [phone]
  );

  return result.rows[0] || null;
}

export async function createBusiness(data: BusinessCreateRequest): Promise<Business> {
  const result = await query<Business>(
    `INSERT INTO businesses (name, slug, description, email, phone, website, address, currency, timezone, whatsapp_phone, waha_session_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, name, slug, description, email, phone, website, address, 
               currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
               status, metadata, created_at, updated_at`,
    [
      data.name,
      data.slug,
      data.description || null,
      data.email || null,
      data.phone || null,
      data.website || null,
      data.address || null,
      data.currency || 'JMD',
      data.timezone || 'America/Jamaica',
      data.whatsapp_phone || null,
      data.waha_session_name || null,
    ]
  );

  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Failed to create business');
  }
  return business;
}

export async function updateBusiness(id: string, data: Partial<BusinessCreateRequest>): Promise<Business> {
  const result = await query<Business>(
    `UPDATE businesses
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         description = COALESCE($4, description),
         email = COALESCE($5, email),
         phone = COALESCE($6, phone),
         website = COALESCE($7, website),
         address = COALESCE($8, address),
         currency = COALESCE($9, currency),
         timezone = COALESCE($10, timezone),
         whatsapp_phone = COALESCE($11, whatsapp_phone),
         waha_session_name = COALESCE($12, waha_session_name),
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, slug, description, email, phone, website, address, 
               currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
               status, metadata, created_at, updated_at`,
    [
      id,
      data.name || null,
      data.slug || null,
      data.description || null,
      data.email || null,
      data.phone || null,
      data.website || null,
      data.address || null,
      data.currency || null,
      data.timezone || null,
      data.whatsapp_phone || null,
      data.waha_session_name || null,
    ]
  );

  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Business not found');
  }
  return business;
}

export async function deleteBusiness(id: string): Promise<void> {
  await query(
    `UPDATE businesses SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
