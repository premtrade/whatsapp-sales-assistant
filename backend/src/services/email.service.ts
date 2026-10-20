import { config } from '../config';
import logger from '../utils/logger';

/**
 * Transactional email.
 *
 * The provider is a deployment choice, not a code choice. SendGrid is the
 * default but not a requirement - each provider below has a free tier that is
 * more than enough for a platform this size, and they only differ in their
 * request shape:
 *
 *   sendgrid  - default, 100/day free
 *   resend    - 3,000/month free, modern API
 *   smtp2go   - 1,000/month free forever, 200/day
 *   brevo     - 300/day free
 *   console   - writes the message to the log instead of sending it
 *
 * Whatever you pick, the sender must be a domain you control (waflo.com) with
 * SPF and DKIM set up, or the mail will be junked.
 */

type EmailContent = { subject: string; text: string; replyTo?: string };

type EmailInput = {
  to: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  text: string;
  replyTo?: string;
};

interface EmailProvider {
  id: string;
  apiKey: string;
  send(input: EmailInput): Promise<boolean>;
}

const sendgridProvider: EmailProvider = {
  id: 'sendgrid',
  apiKey: config.email.sendgridApiKey,
  async send(input) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: input.fromEmail, name: input.fromName },
        ...(input.replyTo ? { reply_to: { email: input.replyTo } } : {}),
        subject: input.subject,
        content: [{ type: 'text/plain', value: input.text }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      logger.error('SendGrid rejected an email request', { status: response.status });
      throw new Error(`Email provider returned ${response.status}`);
    }
    return true;
  },
};

const resendProvider: EmailProvider = {
  id: 'resend',
  apiKey: config.email.resendApiKey,
  async send(input) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${input.fromName} <${input.fromEmail}>`,
        to: [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      logger.error('Resend rejected an email request', { status: response.status });
      throw new Error(`Email provider returned ${response.status}`);
    }
    return true;
  },
};

const smtp2goProvider: EmailProvider = {
  id: 'smtp2go',
  apiKey: config.email.smtp2goApiKey,
  async send(input) {
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.email.smtp2goApiKey,
        sender: `${input.fromName} <${input.fromEmail}>`,
        to: [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text_body: input.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      logger.error('SMTP2GO rejected an email request', { status: response.status });
      throw new Error(`Email provider returned ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as {
      data?: { failed?: unknown[] } | null;
    } | null;
    if (body?.data?.failed) {
      logger.error('SMTP2GO reported failed recipients', { failed: body.data.failed });
      throw new Error('Email provider reported failed recipients');
    }
    return true;
  },
};

const brevoProvider: EmailProvider = {
  id: 'brevo',
  apiKey: config.email.brevoApiKey,
  async send(input) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.email.brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: input.fromEmail, name: input.fromName },
        to: [{ email: input.to }],
        ...(input.replyTo ? { replyTo: { email: input.replyTo } } : {}),
        subject: input.subject,
        textContent: input.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      logger.error('Brevo rejected an email request', { status: response.status });
      throw new Error(`Email provider returned ${response.status}`);
    }
    return true;
  },
};

const consoleProvider: EmailProvider = {
  id: 'console',
  apiKey: '',
  async send(input) {
    logger.info('Email (console provider, not sent)', {
      to: input.to,
      subject: input.subject,
      body: input.text,
    });
    return true;
  },
};

const providers: Record<string, EmailProvider> = {
  sendgrid: sendgridProvider,
  resend: resendProvider,
  smtp2go: smtp2goProvider,
  brevo: brevoProvider,
  console: consoleProvider,
};

export function getEmailProvider(): EmailProvider {
  const requested = (config.email.provider || 'sendgrid').toLowerCase();
  const provider = providers[requested];
  if (!provider) {
    logger.warn('Unknown EMAIL_PROVIDER, falling back to console', { requested });
    return consoleProvider;
  }
  return provider;
}

async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const provider = getEmailProvider();
  const { fromEmail, fromName } = config.email;

  if (provider.id !== 'console' && (!provider.apiKey || !fromEmail)) {
    logger.warn('Email not sent because the provider key or verified sender is not configured', {
      provider: provider.id,
    });
    return false;
  }

  await provider.send({
    to,
    fromEmail,
    fromName,
    subject: content.subject,
    text: content.text,
    replyTo: content.replyTo,
  });

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
  const { supportEmail } = config.email;
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
  sendPaymentRequest(
    email: string,
    name: string,
    details: {
      reference: string;
      amount: number;
      currency: string;
      planName: string;
      periodEnd: Date | string;
      isRenewal: boolean;
    }
  ): Promise<void>;
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

  async sendPaymentRequest(email, name, details): Promise<void> {
    const {
      reference,
      amount,
      currency,
      planName,
      periodEnd,
      isRenewal,
    } = details;
    const { accountName, accountNumber, bankName, paymentEmail, paymentPhone } = config.billing;

    const period = new Date(periodEnd);
    const periodLabel = Number.isNaN(period.getTime())
      ? 'your next billing period'
      : period.toISOString().slice(0, 10);

    const subject = isRenewal
      ? `Your WAFLO ${planName} plan renews on ${periodLabel}`
      : `Complete your WAFLO ${planName} subscription`;

    const text = [
      `Hi ${name},`,
      '',
      isRenewal
        ? `Your ${planName} plan is due for renewal on ${periodLabel}. To keep your WhatsApp workflows running, please transfer ${amount} ${currency} using the details below.`
        : `Please transfer ${amount} ${currency} to activate your ${planName} plan.`,
      '',
      'Payment details',
      `  Reference:  ${reference}`,
      `  Amount:     ${amount} ${currency}`,
      `  Account:    ${accountName || 'ROLINJ.IO'}`,
      `  Number:     ${accountNumber || '(contact us for our account details)'}`,
      `  Bank:       ${bankName || ''}`,
      '',
      `Send the transfer using the reference above, then email proof of payment to ${paymentEmail || 'our support address'}${paymentPhone ? ` or call ${paymentPhone}` : ''}.`,
      '',
      'Your plan is activated as soon as we confirm the payment. You can see the reference and full payment details on the Billing page in your dashboard at any time.',
      '',
      'WAFLO Team',
    ]
      .filter((line) => line !== '')
      .join('\n');

    await sendEmail(email, { subject, text });
    logger.info('Payment request email processed', { reference, isRenewal });
  },
};
