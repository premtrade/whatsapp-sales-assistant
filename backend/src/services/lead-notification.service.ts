import { config } from '../config';
import logger from '../utils/logger';
import { sendWahaText } from './waha.service';
import { toChatId } from './billing/notification.service';

/**
 * WhatsApp delivery for landing-page leads.
 *
 * A visitor who fills in the contact form is a lead, and a lead that nobody
 * sees is a lead that is lost. The form notification is an email, and email
 * depends on a mail provider being configured - which is not something a
 * deployment can assume, and on this platform is not something it currently
 * has.
 *
 * So the lead is also sent over WhatsApp, on the number the site already
 * advertises. The visitor is told on the page that the number is live and
 * answers with this assistant, so a message arriving from it is expected
 * rather than surprising.
 *
 * Two messages, and both are best effort: the inquiry is already recorded
 * before either of them is attempted, so a delivery failure can only cost the
 * notification, never the lead.
 */

export type InquiryNotification = {
  id: string;
  name: string;
  business?: string | null;
  email: string;
  whatsapp?: string | null;
  message: string;
  source: string;
};

function platformNumber(): string | null {
  return config.platform.whatsappNumber || null;
}

/** Tells the operator that a lead has arrived. */
export async function notifyOperatorOfInquiry(inquiry: InquiryNotification): Promise<boolean> {
  const number = platformNumber();
  if (!number) {
    logger.warn('Inquiry notification skipped because no platform WhatsApp number is configured', {
      inquiryId: inquiry.id,
    });
    return false;
  }

  const lines = [
    '*New WAFLO enquiry*',
    '',
    `Name: ${inquiry.name}`,
    ...(inquiry.business ? [`Business: ${inquiry.business}`] : []),
    `Email: ${inquiry.email}`,
    ...(inquiry.whatsapp ? [`WhatsApp: ${inquiry.whatsapp}`] : []),
    `Source: ${inquiry.source}`,
    '',
    inquiry.message,
    '',
    `— sent from the WAFLO site`,
  ];

  try {
    await sendWahaText({
      session: config.platform.whatsappSession,
      chatId: toChatId(number),
      text: lines.join('\n'),
    });
    logger.info('Inquiry sent to the operator over WhatsApp', { inquiryId: inquiry.id });
    return true;
  } catch (error) {
    logger.warn('Inquiry WhatsApp notification failed', {
      inquiryId: inquiry.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Answers the visitor on the number they gave, if they gave one. */
export async function acknowledgeInquiryOverWhatsApp(inquiry: InquiryNotification): Promise<boolean> {
  if (!inquiry.whatsapp) return false;

  const text = [
    `Hi ${inquiry.name},`,
    '',
    'Thanks for your message. We have it, and someone from the team will reply here shortly.',
    '',
    '— WAFLO',
  ].join('\n');

  try {
    await sendWahaText({
      session: config.platform.whatsappSession,
      chatId: toChatId(inquiry.whatsapp),
      text,
    });
    logger.info('Inquiry acknowledged over WhatsApp', { inquiryId: inquiry.id });
    return true;
  } catch (error) {
    logger.warn('Inquiry WhatsApp acknowledgement failed', {
      inquiryId: inquiry.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
