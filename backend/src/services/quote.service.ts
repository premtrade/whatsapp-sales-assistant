import { query } from '../utils/database';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { QuoteFilters, Quote } from '../types';
import { emitDashboardStatsUpdated } from '../websocketServer';
import { generateQuotePDF } from './pdf.service';
import { sendWahaDocument } from './waha.service';
import { config } from '../config';
import { requirePlanFeature } from './subscription.service';

export async function sendQuotePdfToCustomer(quoteId: string, businessId: string): Promise<{ pdfUrl: string; quoteNumber: string; alreadySent: boolean }> {
  await requirePlanFeature(businessId, 'pdf_quotes');
  const result = await query<{
    quote_number: string;
    pdf_url: string | null;
    status: string;
    valid_until: Date | null;
    customer_phone: string;
    customer_name: string;
    requires_review: boolean;
    waha_session_name: string | null;
  }>(
    `SELECT q.quote_number, q.pdf_url, q.status, q.valid_until, c.phone AS customer_phone,
            c.display_name AS customer_name,
            COALESCE((q.metadata->>'requires_review')::boolean, false) AS requires_review,
            b.waha_session_name
     FROM quotes q
     JOIN contacts c ON c.id = q.contact_id AND c.business_id = q.business_id
     JOIN businesses b ON b.id = q.business_id
     WHERE q.id = $1 AND q.business_id = $2`,
    [quoteId, businessId]
  );
  const quote = result.rows[0];
  if (!quote) throw new NotFoundError('Quote not found for this business');
  if (quote.requires_review) throw new BadRequestError('Quote requires staff review before it can be sent');
  if (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now()) {
    throw new BadRequestError('This quote has expired and cannot be sent');
  }
  if (quote.status === 'sent') {
    return { pdfUrl: quote.pdf_url || '', quoteNumber: quote.quote_number, alreadySent: true };
  }
  if (!['draft'].includes(quote.status)) throw new BadRequestError(`Quote cannot be sent from status '${quote.status}'`);
  const phone = quote.customer_phone.replace(/\D/g, '');
  if (!phone) throw new BadRequestError('Customer does not have a valid WhatsApp number');

  const filePath = await generateQuotePDF(quoteId);
  const filename = `${filePath.split(/[\\/]/).pop() || `Quote_${quote.quote_number}.pdf`}`;
  await sendWahaDocument({
    session: quote.waha_session_name || config.waha.session || 'default',
    chatId: `${phone}@c.us`,
    filePath,
    filename,
    caption: `Here is your quote ${quote.quote_number} for ${quote.customer_name}. It is valid until ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : 'further notice'}. Reply “I accept” to accept it.`,
  });

  const pdfUrl = `/storage/quotes/${encodeURIComponent(filename)}`;
  await query(
    `UPDATE quotes SET pdf_url = $1, sent_at = NOW(), sent_via = 'whatsapp',
       status = 'sent', updated_at = NOW()
     WHERE id = $2 AND business_id = $3 AND status = 'draft'`,
    [pdfUrl, quoteId, businessId]
  );
  return { pdfUrl, quoteNumber: quote.quote_number, alreadySent: false };
}

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

  const tenantId = filters.businessId || filters.tenantId;
  if (tenantId) {
    conditions.push(`q.business_id = $${paramIndex++}`);
    params.push(tenantId);
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

export async function getQuoteById(id: string, tenantId?: string): Promise<Quote> {
  let sql = `SELECT id, business_id, quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until, created_by, created_at, updated_at, metadata
     FROM quotes
     WHERE id = $1`;
  const params: unknown[] = [id];

  if (tenantId) {
    sql += ' AND business_id = $2';
    params.push(tenantId);
  }

  const result = await query<Quote>(sql, params);

  const row = result.rows[0];
  if (!row) throw new NotFoundError('Quote not found');
  return {
    ...row,
    requires_review: Boolean((row as { metadata?: { requires_review?: boolean } }).metadata?.requires_review),
  } as Quote;
}

export async function getQuoteWithDetails(id: string, tenantId?: string): Promise<QuoteWithDetails> {
  const quote = await getQuoteById(id, tenantId);

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

export async function updateQuoteStatus(id: string, status: string, tenantId?: string): Promise<Quote> {
  const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }

  let sql = `UPDATE quotes SET status = $1, updated_at = NOW() WHERE id = $2`;
  const params: unknown[] = [status, id];

  if (tenantId) {
    sql += ' AND business_id = $3';
    params.push(tenantId);
  }

  sql += ' RETURNING id, business_id, quote_number, contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until, created_by, created_at, updated_at, metadata';

  const result = await query<Quote>(sql, params);

  const quote = result.rows[0];
  if (!quote) throw new NotFoundError('Quote not found');

  // Emit real-time event for dashboard update scoped to tenant
  const emitTenantId = quote.business_id || tenantId;
  if (emitTenantId) {
    await emitDashboardStatsUpdated(undefined, emitTenantId);
  }

  return {
    ...quote,
    requires_review: Boolean((quote as { metadata?: { requires_review?: boolean } }).metadata?.requires_review),
  } as Quote;
}

/**
 * Accept a quote from a webhook callback (e.g., when a customer replies 'yes'/'I accept').
 * Finds the quote(s) in 'sent' status for the given conversation and updates to 'accepted'.
 */
export async function acceptQuoteFromWebhook(
  conversationId: string,
  businessId?: string
): Promise<{ success: boolean; quoteId?: string; businessId?: string; contactId?: string }> {
  const result = await query<{ id: string; business_id: string; contact_id: string }>(
    `WITH target AS (
       SELECT q.id
       FROM quotes q
       JOIN conversations c ON c.id = q.conversation_id AND c.business_id = q.business_id
       WHERE q.conversation_id = $1
         AND ($2::uuid IS NULL OR q.business_id = $2::uuid)
         AND q.status = 'sent'
         AND (q.valid_until IS NULL OR q.valid_until >= CURRENT_DATE)
       ORDER BY q.created_at DESC
       LIMIT 1
       FOR UPDATE OF q
     )
     UPDATE quotes q
     SET status = 'accepted', updated_at = NOW()
     FROM target
     WHERE q.id = target.id
     RETURNING q.id, q.business_id, q.contact_id`,
    [conversationId, businessId || null]
  );
  const accepted = result.rows[0];
  if (!accepted) return { success: false };
  return {
    success: true,
    quoteId: accepted.id,
    businessId: accepted.business_id,
    contactId: accepted.contact_id,
  };
}

