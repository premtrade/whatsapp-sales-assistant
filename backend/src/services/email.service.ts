import { config } from '../config';
import logger from '../utils/logger';

type EmailContent = { subject: string; text: string; replyTo?: string };

async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const { apiKey, fromEmail, fromName } = config.sendgrid;
  if (!apiKey || !fromEmail) {
    logger.warn('Email not sent because SendGrid API key or verified sender is not configured');
    return false;
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      ...(content.replyTo ? { reply_to: { email: content.replyTo } } : {}),
      subject: content.subject,
      content: [{ type: 'text/plain', value: content.text }],
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    logger.error('SendGrid rejected an email request', { status: response.status });
    throw new Error(`Email provider returned ${response.status}`);
  }
  return true;
}

export async function sendContactAcknowledgement(email: string, name: string, supportTicket: boolean): Promise<void> {
  const subject = supportTicket ? 'We received your WAFLO support request' : 'We received your message to WAFLO';
  const text = supportTicket
    ? `Hi ${name},\n\nWe received your support request. Our team will review it and follow up using this email address.\n\nIf you need to add information, reply to this email.\n\nWAFLO Support`
    : `Hi ${name},\n\nThanks for contacting WAFLO. We received your message and our team will follow up using this email address.\n\nWAFLO Team`;
  await sendEmail(email, { subject, text });
}

export async function sendSupportNotification(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  source: string;
}): Promise<void> {
  const { supportEmail } = config.sendgrid;
  if (!supportEmail) {
    logger.warn('Support notification not sent because SUPPORT_EMAIL is not configured', { source: input.source });
    return;
  }
  await sendEmail(supportEmail, {
    subject: `[WAFLO] ${input.subject}`,
    text: `From: ${input.name} <${input.email}>\nSource: ${input.source}\n\n${input.message}`,
    replyTo: input.email,
  });
}

export interface EmailService {
  sendTrialReminder(email: string, name: string, source: string, daysRemaining: number): Promise<void>;
  sendWelcomeEmail(email: string, name: string): Promise<void>;
}

export const emailService: EmailService = {
  async sendTrialReminder(email, name, source, daysRemaining): Promise<void> {
    const sent = await sendEmail(email, {
      subject: `Your WAFLO trial ends in ${daysRemaining} days`,
      text: `Hi ${name},\n\nYour WAFLO trial ends in about ${daysRemaining} days. Visit the Billing page in your dashboard to review your plan and keep your business workflows running.\n\nWAFLO Team`,
    });
    if (!sent) throw new Error('Trial reminder email was not sent because email delivery is not configured');
    logger.info('Trial reminder email processed', { source });
  },

  async sendWelcomeEmail(email, name): Promise<void> {
    await sendEmail(email, {
      subject: 'Welcome to WAFLO',
      text: `Hi ${name},\n\nWelcome to WAFLO. Start by connecting your business WhatsApp number, adding your business knowledge, and sending a test reply.\n\nWAFLO Team`,
    });
  },
};
