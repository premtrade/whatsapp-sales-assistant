import { query } from '../../utils/database';
import logger from '../../utils/logger';
import { config } from '../../config';
import { sendWahaText } from '../waha.service';
import { emailService } from '../email.service';

/**
 * Billing notifications.
 *
 * WAFLO's customers are WhatsApp businesses, so the channel that actually gets
 * read is WhatsApp - and the platform already has a WhatsApp connection for
 * every tenant. A renewal request sent over the tenant's own WhatsApp
 * connection costs a fraction of an email and lands on a phone the owner is
 * already holding.
 *
 * Email is the fallback for tenants who have no usable phone on file.
 */

export type BillingContact = {
  name: string;
  phone: string | null;
  email: string | null;
  session: string | null;
};

export type NotificationChannel = 'whatsapp' | 'email' | 'none';

type ContactRow = {
  name: string | null;
  phone: string | null;
  email: string | null;
  waha_session_name: string | null;
  staff_phone: string | null;
  staff_name: string | null;
  staff_email: string | null;
};

/**
 * The person to notify: the business's admin or manager if they have a phone
 * on file, otherwise the business contact.
 */
export async function resolveBillingContact(businessId: string): Promise<BillingContact> {
  const result = await query<ContactRow>(
    `SELECT b.name, b.phone, b.email, b.waha_session_name,
            s.phone AS staff_phone, s.display_name AS staff_name, s.email AS staff_email
       FROM businesses b
       LEFT JOIN LATERAL (
         SELECT su.phone, su.display_name, su.email
           FROM staff_users su
          WHERE su.business_id = b.id AND su.status = 'active'
            AND su.deleted_at IS NULL
            AND su.role IN ('admin','manager')
          ORDER BY (su.role = 'admin') DESC, su.created_at ASC
          LIMIT 1
       ) s ON TRUE
      WHERE b.id = $1
      LIMIT 1`,
    [businessId]
  );

  const row = result.rows[0];
  if (!row) {
    return { name: 'there', phone: null, email: null, session: null };
  }

  return {
    name: row.staff_name || row.name || 'there',
    phone: row.staff_phone || row.phone || null,
    email: row.staff_email || row.email || null,
    session: row.waha_session_name || null,
  };
}

function toChatId(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.includes('@')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : trimmed;
}

export type PaymentRequestDetails = {
  reference: string;
  amount: number;
  currency: string;
  planName: string;
  periodEnd: Date | string;
  isRenewal: boolean;
};

function buildWhatsAppMessage(details: PaymentRequestDetails): string {
  const { reference, amount, currency, planName, periodEnd, isRenewal } = details;
  const period = new Date(periodEnd);
  const periodLabel = Number.isNaN(period.getTime())
    ? 'your next billing period'
    : period.toISOString().slice(0, 10);

  const lines = [
    isRenewal
      ? `Your WAFLO *${planName}* plan is due for renewal on ${periodLabel}.`
      : `Your WAFLO *${planName}* plan is ready to activate.`,
    '',
    `*Amount:* ${amount} ${currency}`,
    `*Reference:* ${reference}`,
  ];

  if (config.billing.accountNumber) {
    lines.push(
      '',
      `*Pay by transfer*`,
      `Account name: ${config.billing.accountName || 'ROLINJ.IO'}`,
      `Account number: ${config.billing.accountNumber}`,
      ...(config.billing.bankName ? [`Bank: ${config.billing.bankName}`] : []),
    );
  }

  lines.push(
    '',
    'Quote the reference on your transfer, then reply to this message with your receipt. Your plan is activated as soon as we confirm the payment.',
    '',
    '— WAFLO',
  );

  return lines.join('\n');
}

/**
 * Notifies a customer that a payment is outstanding. WhatsApp first, email
 * only when there is no usable phone number.
 */
export async function notifyPaymentRequest(
  businessId: string,
  details: PaymentRequestDetails
): Promise<NotificationChannel> {
  const contact = await resolveBillingContact(businessId);

  if (contact.phone && contact.session) {
    try {
      await sendWahaText({
        session: contact.session,
        chatId: toChatId(contact.phone),
        text: buildWhatsAppMessage(details),
      });
      logger.info('Payment request sent over WhatsApp', {
        businessId,
        reference: details.reference,
      });
      return 'whatsapp';
    } catch (error) {
      logger.warn('WhatsApp payment request failed, falling back to email', {
        businessId,
        reference: details.reference,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (contact.email) {
    try {
      await emailService.sendPaymentRequest(contact.email, contact.name, details);
      logger.info('Payment request sent over email', {
        businessId,
        reference: details.reference,
      });
      return 'email';
    } catch (error) {
      logger.warn('Email payment request failed', {
        businessId,
        reference: details.reference,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.warn('Payment request could not be delivered', {
    businessId,
    reference: details.reference,
  });
  return 'none';
}
