import { query } from '../utils/database';
import { BadRequestError } from '../utils/errors';
import logger from '../utils/logger';

export interface ContactInquiry {
  id: string;
  name: string;
  business?: string | null;
  email: string;
  whatsapp?: string | null;
  message: string;
  source: string;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ContactInquiryInput extends CreateContactInquiryInput {
  trialEndsAt?: Date;
}

/**
 * Placeholder for email autoresponder.
 * When an email provider is configured (SendGrid, SES, Resend, etc.),
 * implement sendAutoresponder(email, name, source) here and call it
 * from createContactInquiry after the DB insert.
 */
async function sendAutoresponder(_email: string, _name: string, _source: string): Promise<void> {
  logger.info('Autoresender hook triggered', { email: _email, source: _source });
}

export async function createContactInquiry(input: CreateContactInquiryInput): Promise<ContactInquiry> {
  if (!input.name.trim()) {
    throw new BadRequestError('Name is required');
  }
  if (!input.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new BadRequestError('Valid email is required');
  }
  if (!input.message.trim()) {
    throw new BadRequestError('Message is required');
  }

  const result = await query<ContactInquiry>(
    `INSERT INTO contact_inquiries (name, business, email, whatsapp, message, source, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id, name, business, email, whatsapp, message, source, ip_address, user_agent, metadata, created_at, updated_at`,
    [
      input.name.trim(),
      input.business?.trim() || null,
      input.email.trim().toLowerCase(),
      input.whatsapp?.trim() || null,
      input.message.trim(),
      input.source || 'landing-page',
      input.ipAddress || null,
      input.userAgent || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  const inquiry = result.rows[0];
  if (!inquiry) {
    throw new BadRequestError('Failed to create contact inquiry');
  }

  logger.info('Contact inquiry created', {
    inquiryId: inquiry.id,
    email: inquiry.email,
    source: inquiry.source,
  });

  // Fire-and-forget autoresponder. Do not block the response on email delivery.
  sendAutoresponder(inquiry.email, inquiry.name, inquiry.source).catch((err) => {
    logger.warn('Autoresponder failed', { error: err instanceof Error ? err.message : err });
  });

  return inquiry;
}

export async function listContactInquiries(options?: { page?: number; limit?: number; source?: string }): Promise<{ data: ContactInquiry[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.source) {
    conditions.push(`source = $${idx++}`);
    params.push(options.source);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ total: string }>(`SELECT COUNT(*) as total FROM contact_inquiries ${where}`, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  const dataResult = await query<ContactInquiry>(
    `SELECT id, name, business, email, whatsapp, message, source, ip_address, user_agent, metadata, created_at, updated_at
     FROM contact_inquiries
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    data: dataResult.rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
