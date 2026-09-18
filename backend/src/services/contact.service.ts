import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { ContactFilters, Contact, CustomerFact } from '../types';

export interface ContactWithDetails extends Contact {
  facts: CustomerFact[];
  quotes: unknown[];
  appointments: unknown[];
}

function buildWhereClause(filters: ContactFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search) {
    conditions.push(`(display_name ILIKE $${paramIndex++} OR phone ILIKE $${paramIndex++} OR email ILIKE $${paramIndex++} OR company ILIKE $${paramIndex++})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.source) {
    conditions.push(`source = $${paramIndex++}`);
    params.push(filters.source);
  }
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(`tags && $${paramIndex++}`);
    params.push(filters.tags);
  }

  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`business_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} AND deleted_at IS NULL` : 'WHERE deleted_at IS NULL';

  return { where: whereClause, params };
}

export async function getContacts(filters: ContactFilters): Promise<{ data: Contact[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortBy = filters.sortBy || 'created_at';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM contacts ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT id, phone, display_name, email, company, source, preferred_language, opt_in, tags, notes, status, first_seen_at, last_seen_at, created_at, updated_at
    FROM contacts
    ${where}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<Contact>(dataQuery, [...params, limit, offset]);

  return {
    data: dataResult.rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getContactById(id: string, tenantId?: string): Promise<Contact> {
  let sql = `
    SELECT id, business_id, phone, display_name, email, company, source, preferred_language, opt_in, tags, notes, status, first_seen_at, last_seen_at, created_at, updated_at
    FROM contacts
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const params: unknown[] = [id];

  if (tenantId) {
    sql += ' AND business_id = $2';
    params.push(tenantId);
  }

  const result = await query<Contact>(sql, params);

  const contact = result.rows[0];

  if (!contact) {
    throw new NotFoundError('Contact not found');
  }

  return contact;
}

export async function getContactWithDetails(id: string, tenantId?: string): Promise<ContactWithDetails> {
  const contact = await getContactById(id, tenantId);

  const [factsResult] = await Promise.all([
    query<CustomerFact>(
      `SELECT id, contact_id, fact_key, fact_value, confidence, source, created_at, updated_at
       FROM customer_facts
       WHERE contact_id = $1
       ORDER BY updated_at DESC`,
      [id]
    ),
  ]);

  const quotesResult = await query(
    `SELECT id, quote_number, status, subtotal, tax, discount, total, currency, valid_until, created_at
     FROM quotes
     WHERE contact_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [id]
  );

  const appointmentsResult = await query(
    `SELECT id, appointment_type, status, title, starts_at, ends_at, assigned_to, reminder_sent, created_at
     FROM appointments
     WHERE contact_id = $1
     ORDER BY starts_at DESC
     LIMIT 10`,
    [id]
  );

  return {
    ...contact,
    facts: factsResult.rows,
    quotes: quotesResult.rows,
    appointments: appointmentsResult.rows,
  };
}

export async function searchContacts(searchTerm: string, limit = 20, tenantId?: string): Promise<Contact[]> {
  let sql = `
    SELECT id, business_id, phone, display_name, email, company, source, preferred_language, opt_in, tags, notes, status, first_seen_at, last_seen_at, created_at, updated_at
    FROM contacts
    WHERE deleted_at IS NULL
      AND (display_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 OR company ILIKE $1)
  `;
  const params: unknown[] = [`%${searchTerm}%`];
  let paramIndex = 2;

  if (tenantId) {
    sql += ` AND business_id = $${paramIndex++}`;
    params.push(tenantId);
  }

  sql += ` ORDER BY last_seen_at DESC LIMIT $${paramIndex++}`;
  params.push(limit);

  const result = await query<Contact>(sql, params);

  return result.rows;
}

export async function getCustomerFactsByContactId(contactId: string, tenantId?: string): Promise<CustomerFact[]> {
  // If tenantId is provided, verify contact belongs to tenant first
  if (tenantId) {
    await getContactById(contactId, tenantId);
  }

  const result = await query<CustomerFact>(
    `SELECT id, contact_id, fact_key, fact_value, confidence, source, created_at, updated_at
     FROM customer_facts
     WHERE contact_id = $1
     ORDER BY updated_at DESC`,
    [contactId]
  );

  return result.rows;
}

