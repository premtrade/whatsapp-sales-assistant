import { query } from '../utils/database';
import { BadRequestError } from '../utils/errors';
import logger from '../utils/logger';
import { sendContactAcknowledgement, sendSupportNotification } from './email.service';

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

export interface CreateContactInquiryInput {
  name: string;
  business?: string | null;
  email: string;
  whatsapp?: string | null;
  message: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface ContactInquiryInput extends CreateContactInquiryInput {
  trialEndsAt?: Date;
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

  const supportTicket = inquiry.source === 'support-ticket';
  const metadataSubject = typeof inquiry.metadata?.subject === 'string' ? inquiry.metadata.subject : '';
  void Promise.allSettled([
    sendContactAcknowledgement(inquiry.email, inquiry.name, supportTicket),
    sendSupportNotification({
      name: inquiry.name,
      email: inquiry.email,
      subject: metadataSubject || (supportTicket ? 'New support request' : 'New contact inquiry'),
      message: inquiry.message,
      source: inquiry.source,
    }),
  ]).then(([ackResult, notifyResult]) => {
    if (ackResult.status === 'rejected') {
      logger.warn('Contact acknowledgement email failed', { inquiryId: inquiry.id, error: ackResult.reason instanceof Error ? ackResult.reason.message : 'Unknown error' });
    }
    if (notifyResult.status === 'rejected') {
      logger.warn('Support notification email failed', { inquiryId: inquiry.id, error: notifyResult.reason instanceof Error ? notifyResult.reason.message : 'Unknown error' });
    }
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
