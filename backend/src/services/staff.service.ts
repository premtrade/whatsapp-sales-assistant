import { query } from '../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { StaffUser, PaginationQuery } from '../types';
import { hashPassword } from './auth.service';

export interface StaffFilters extends PaginationQuery {
  search?: string;
  role?: string;
  status?: string;
  businessId?: string;
  tenantId?: string;
}

export interface StaffCreateRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role?: string;
  timezone?: string;
  password?: string;
  status?: string;
}

export type StaffUpdateRequest = Partial<StaffCreateRequest>;

export const STAFF_COLUMNS = `id, employee_number, first_name, last_name, 
display_name, email, phone, role, status, timezone, metadata, created_at, updated_at, business_id`;
export const VALID_ROLES = ['super_admin', 'admin', 'manager', 'sales', 'support', 'technician'];
export const VALID_STATUSES = ['active', 'inactive', 'suspended'];

export async function getStaffUsers(filters: StaffFilters): Promise<{
  data: StaffUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`business_id = $${i++}`);
    params.push(tenantId);
  }

  if (filters.search) {
    conditions.push(`(first_name ILIKE $${i++} OR last_name ILIKE $${i++} OR email ILIKE $${i++})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    i += 2;
  }
  if (filters.role) {
    conditions.push(`role = $${i++}`);
    params.push(filters.role);
  }
  if (filters.status) {
    conditions.push(`status = $${i++}`);
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await query<{ total: string }>(`SELECT COUNT(*) as total FROM staff_users ${where}`, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataResult = await query<StaffUser>(
    `SELECT ${STAFF_COLUMNS} FROM staff_users ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  return { data: dataResult.rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getStaffUserById(id: string, tenantId?: string): Promise<StaffUser> {
  let sql = `SELECT ${STAFF_COLUMNS} FROM staff_users WHERE id = $1`;
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  const result = await query<StaffUser>(sql, params);
  const user = result.rows[0];
  if (!user) throw new NotFoundError('Staff user not found');
  return user;
}

export async function createStaffUser(data: StaffCreateRequest, tenantId: string): Promise<StaffUser> {
  const firstName = (data.first_name || '').trim();
  const lastName = (data.last_name || '').trim();
  const email = (data.email || '').toLowerCase().trim();
  if (!firstName) throw new BadRequestError('first_name is required');
  if (!lastName) throw new BadRequestError('last_name is required');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestError('A valid email is required');

  const role = data.role || 'sales';
  if (!VALID_ROLES.includes(role)) throw new BadRequestError(`role must be one of: ${VALID_ROLES.join(', ')}`);
  const status = data.status || 'active';
  if (!VALID_STATUSES.includes(status)) throw new BadRequestError(`status must be one of: ${VALID_STATUSES.join(', ')}`);

  // Check email uniqueness within tenant
  const existing = await query(`SELECT id FROM staff_users WHERE email = $1 AND business_id = $2`, [email, tenantId]);
  if (existing.rows.length > 0) throw new ConflictError('A staff user with this email already exists in this tenant');

  const countResult = await query<{ total: string }>(`SELECT COUNT(*) as total FROM staff_users WHERE business_id = $1`, [tenantId]);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);
  const employeeNumber = `EMP${String(total + 1).padStart(3, '0')}`;
  const passwordHash = await hashPassword(data.password || `${firstName.toLowerCase()}123!`);

  try {
    const result = await query<StaffUser>(
      `INSERT INTO staff_users (employee_number, first_name, last_name, email, phone, role, status, timezone, password_hash, business_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${STAFF_COLUMNS}`,
      [employeeNumber, firstName, lastName, email, data.phone || null, role, status, data.timezone || 'America/Jamaica', passwordHash, tenantId]
    );
    const created = result.rows[0];
    if (!created) throw new BadRequestError('Failed to create staff user');
    return created;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
      throw new ConflictError('A staff user with this email or employee number already exists in this tenant');
    }
    throw error;
  }
}

export async function updateStaffUser(id: string, data: Partial<StaffCreateRequest>, tenantId: string): Promise<StaffUser> {
  await getStaffUserById(id, tenantId);
  if (data.role && !VALID_ROLES.includes(data.role)) throw new BadRequestError('Invalid role');
  if (data.status && !VALID_STATUSES.includes(data.status)) throw new BadRequestError('Invalid status');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new BadRequestError('A valid email is required');

  const sets: string[] = [];
  const params: unknown[] = [id];
  let i = 2;
  const push = (col: string, value: unknown) => { sets.push(`${col} = $${i++}`); params.push(value); };
  if (data.first_name !== undefined) push('first_name', data.first_name.trim());
  if (data.last_name !== undefined) push('last_name', data.last_name.trim());
  if (data.email !== undefined) push('email', data.email.toLowerCase().trim());
  if (data.phone !== undefined) push('phone', data.phone || null);
  if (data.role !== undefined) push('role', data.role);
  if (data.status !== undefined) push('status', data.status);
  if (data.timezone !== undefined) push('timezone', data.timezone);
  if (data.password) push('password_hash', await hashPassword(data.password));
  if (sets.length === 0) throw new BadRequestError('No fields to update');

  // Add tenant filter
  params.push(tenantId);
  sets.push(`business_id = $${params.length}`);

  try {
    const result = await query<StaffUser>(
      `UPDATE staff_users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND business_id = $${params.length} RETURNING ${STAFF_COLUMNS}`,
      params
    );
    const updated = result.rows[0];
    if (!updated) throw new NotFoundError('Staff user not found in this tenant');
    return updated;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
      throw new ConflictError('A staff user with this email already exists in this tenant');
    }
    throw error;
  }
}

export async function updateStaffStatus(id: string, status: string, tenantId: string): Promise<StaffUser> {
  if (!VALID_STATUSES.includes(status)) throw new BadRequestError('Invalid status');
  const result = await query<StaffUser>(
    `UPDATE staff_users SET status = $2, updated_at = NOW() WHERE id = $1 AND business_id = $3 RETURNING ${STAFF_COLUMNS}`,
    [id, status, tenantId]
  );
  const updated = result.rows[0];
  if (!updated) throw new NotFoundError('Staff user not found in this tenant');
  return updated;
}

export async function deleteStaffUser(id: string, tenantId: string): Promise<void> {
  // First, ensure the staff user exists in this tenant
  await getStaffUserById(id, tenantId);
  // Delete the staff user
  await query(`DELETE FROM staff_users WHERE id = $1 AND business_id = $2`, [id, tenantId]);
}