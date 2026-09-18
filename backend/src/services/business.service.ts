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
  status?: string;
}

function isSuperAdmin(reqUser?: { role?: string } | null): boolean {
  return Boolean(reqUser?.role === 'super_admin');
}

export async function getBusinesses(reqUser?: { role?: string } | null, businessId?: string): Promise<Business[]> {
  const sql = `
    SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
    FROM businesses
    WHERE deleted_at IS NULL
      AND ($1::text IS NULL OR status = $1)
      AND ($2::uuid IS NULL OR id = $2 OR EXISTS (
        SELECT 1 FROM staff_users WHERE staff_users.business_id = businesses.id AND staff_users.id = $3::uuid
      ))
    ORDER BY name ASC
  `;
  const status = isSuperAdmin(reqUser) ? null : 'active';
  const requesterBusinessId = businessId || null;
  const result = await query<Business>(sql, [status, requesterBusinessId, requesterBusinessId]);
  return result.rows;
}

export async function getBusinessById(id: string, reqUser?: { role?: string } | null, businessId?: string): Promise<Business> {
  const sql = `
    SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
    FROM businesses
    WHERE id = $1
      AND deleted_at IS NULL
      AND ($2::text IS NULL OR status = $2)
      AND ($3::uuid IS NULL OR id = $3 OR EXISTS (
        SELECT 1 FROM staff_users WHERE staff_users.business_id = businesses.id AND staff_users.id = $4::uuid
      ))
    LIMIT 1
  `;
  const status = isSuperAdmin(reqUser) ? null : 'active';
  const requesterBusinessId = businessId || null;
  const result = await query<Business>(sql, [id, status, requesterBusinessId, requesterBusinessId]);
  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Business not found');
  }
  return business;
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const result = await query<Business>(
    `SELECT id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at
     FROM businesses
     WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  );
  return result.rows[0] || null;
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
  const result = await query<Business>(`
    INSERT INTO businesses (
      name, slug, description, email, phone, website, address, currency, timezone, 
      whatsapp_phone, waha_session_name, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id, name, slug, description, email, phone, website, address, 
              currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
              status, metadata, created_at, updated_at
  `, [
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
    data.status || 'pending',
  ]);

  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Failed to create business');
  }

  return business;
}

export async function updateBusiness(id: string, data: Partial<BusinessCreateRequest>, reqUser?: { role?: string } | null, businessId?: string): Promise<Business> {
  let sql = `
    UPDATE businesses
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
        status = COALESCE($13, status),
        updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const params: unknown[] = [
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
    data.status || null,
  ];
  let paramIndex = 14;

  if (!isSuperAdmin(reqUser)) {
    sql += ` AND id = $${paramIndex++}`;
    params.push(businessId || '');
  }

  sql += ` RETURNING id, name, slug, description, email, phone, website, address, 
            currency, timezone, logo_url, whatsapp_phone, waha_session_name, 
            status, metadata, created_at, updated_at`;

  const result = await query<Business>(sql, params);
  const business = result.rows[0];
  if (!business) {
    throw new NotFoundError('Business not found');
  }
  return business;
}

export async function deleteBusiness(id: string, reqUser?: { role?: string } | null, businessId?: string): Promise<void> {
  let sql = `
    UPDATE businesses
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (!isSuperAdmin(reqUser)) {
    sql += ` AND id = $${paramIndex++}`;
    params.push(businessId || '');
  }

  await query(sql, params);
}
