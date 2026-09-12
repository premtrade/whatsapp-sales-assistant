import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { QuoteFilters, Quote } from '../types';
import { emitDashboardStatsUpdated } from '../websocketServer';

export interface QuoteWithDetails extends Quote {
  contactName: string;
  items: unknown[];
}

function buildWhereClause(filters: QuoteFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`q.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.contactId) {
    conditions.push(`q.contact_id = $${paramIndex++}`);
    params.push(filters.contactId);
  }
  if (filters.conversationId) {
    conditions.push(`q.conversation_id = $${paramIndex++}`);
    params.push(filters.conversationId);
  }
  if (filters.search) {
    conditions.push(`(q.quote_number ILIKE $${paramIndex++} OR ct.display_name ILIKE $${paramIndex++})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where: whereClause, params };
}

export async function getQuotes(filters: QuoteFilters): Promise<{ data: Quote[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  const { where, params } = buildWhereClause(filters);

  const countQuery = `SELECT COUNT(*) as total FROM quotes q JOIN contacts ct ON q.contact_id = ct.id ${where}`;
  const countResult = await query<{ total: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataQuery = `
    SELECT q.id, q.quote_number, q.contact_id, q.conversation_id, q.status, q.subtotal, q.tax, q.discount, q.total, q.currency, q.notes, q.valid_until, q.created_by, q.created_at, q.updated_at, q.metadata,
           ct.display_name as contact_name
    FROM quotes q
    JOIN contacts ct ON q.contact_id = ct.id
    ${where}
    ORDER BY q.created_at ${sortOrder}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const dataResult = await query<Quote & { requires_review?: boolean }>(dataQuery, [...params, limit, offset]);
  const rows = dataResult.rows.map((r) => ({
    ...r,
    requires_review: Boolean((r as { metadata?: { requires_review?: boolean } }).metadata?.requires_review),
  }));

  return {
    data: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getQuoteById(id: string): Promise<Quote> {
  const result = await query<Quote>(
    `SELECT id, quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until, created_by, created_at, updated_at, metadata
     FROM quotes
     WHERE id = $1`,
    [id]
  );

  const row = result.rows[0];
  if (!row) throw new NotFoundError('Quote not found');
  return {
    ...row,
    requires_review: Boolean((row as { metadata?: { requires_review?: boolean } }).metadata?.requires_review),
  } as Quote;
}

export async function getQuoteWithDetails(id: string): Promise<QuoteWithDetails> {
  const quote = await getQuoteById(id);

  const [contactResult, itemsResult] = await Promise.all([
    query<{ display_name: string }>('SELECT display_name FROM contacts WHERE id = $1', [quote.contact_id]),
    query('SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY line_number ASC', [id]),
  ]);

  return {
    ...quote,
    contactName: contactResult.rows[0]?.display_name ?? '',
    items: itemsResult.rows,
  };
}

export async function updateQuoteStatus(id: string, status: string): Promise<Quote> {
  const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }

  const result = await query<Quote>(
    `UPDATE quotes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until, created_by, created_at, updated_at, metadata`,
    [status, id]
  );

  const quote = result.rows[0];
  if (!quote) throw new NotFoundError('Quote not found');

  // Emit real-time event for dashboard update
  await emitDashboardStatsUpdated();

  return {
    ...quote,
    requires_review: Boolean((quote as { metadata?: { requires_review?: boolean } }).metadata?.requires_review),
  } as Quote;
}
