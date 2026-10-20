import { query } from '../utils/database';
import { resolveBillingContact, notifyPaymentRequest } from '../services/billing/notification.service';
import { getEmailProvider } from '../services/email.service';
import { config } from '../config';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/waha.service', () => ({
  sendWahaText: jest.fn().mockResolvedValue({}),
}));

jest.mock('../services/email.service', () => {
  const actual = jest.requireActual('../services/email.service');
  return {
    ...actual,
    emailService: { sendPaymentRequest: jest.fn().mockResolvedValue(undefined) },
  };
});

const mockQuery = query as jest.MockedFunction<typeof query>;
const { sendWahaText } = jest.requireMock('../services/waha.service');
const { emailService } = jest.requireMock('../services/email.service');

function rows(value: any[]) {
  return { rows: value, rowCount: value.length } as any;
}

const details = {
  reference: 'WAF-ABCD2345',
  amount: 199,
  currency: 'USD',
  planName: 'Professional',
  periodEnd: new Date('2026-12-01'),
  isRenewal: true,
};

beforeEach(() => {
  mockQuery.mockReset();
  sendWahaText.mockReset().mockResolvedValue({});
  emailService.sendPaymentRequest.mockReset().mockResolvedValue(undefined);
});

describe('resolveBillingContact', () => {
  it('prefers the admin phone and name over the business contact', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          name: 'Demo Construction',
          phone: '+18765550000',
          email: 'hello@demo.test',
          waha_session_name: 'waha-demo',
          staff_phone: '+18765551111',
          staff_name: 'Jane Owner',
          staff_email: 'jane@demo.test',
        },
      ])
    );

    const contact = await resolveBillingContact('biz-1');

    expect(contact).toEqual({
      name: 'Jane Owner',
      phone: '+18765551111',
      email: 'jane@demo.test',
      session: 'waha-demo',
    });
  });

  it('falls back to the business contact when no staff phone is on file', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          name: 'Demo Construction',
          phone: '+18765550000',
          email: 'hello@demo.test',
          waha_session_name: 'waha-demo',
          staff_phone: null,
          staff_name: null,
          staff_email: null,
        },
      ])
    );

    const contact = await resolveBillingContact('biz-1');

    expect(contact.phone).toBe('+18765550000');
    expect(contact.email).toBe('hello@demo.test');
  });
});

describe('notifyPaymentRequest', () => {
  it('sends over WhatsApp when the tenant has a phone and a session', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          name: 'Demo Construction',
          phone: '+18765550000',
          email: 'hello@demo.test',
          waha_session_name: 'waha-demo',
          staff_phone: '+18765551111',
          staff_name: 'Jane Owner',
          staff_email: 'jane@demo.test',
        },
      ])
    );

    const channel = await notifyPaymentRequest('biz-1', details);

    expect(channel).toBe('whatsapp');
    expect(sendWahaText).toHaveBeenCalledTimes(1);
    const payload = sendWahaText.mock.calls[0][0];
    expect(payload.session).toBe('waha-demo');
    expect(payload.chatId).toBe('18765551111@c.us');
    expect(payload.text).toContain('WAF-ABCD2345');
    expect(payload.text).toContain('199 USD');
    // Email is the fallback, not a second copy.
    expect(emailService.sendPaymentRequest).not.toHaveBeenCalled();
  });

  it('falls back to email when there is no phone on file', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          name: 'Demo Construction',
          phone: null,
          email: 'hello@demo.test',
          waha_session_name: 'waha-demo',
          staff_phone: null,
          staff_name: null,
          staff_email: null,
        },
      ])
    );

    const channel = await notifyPaymentRequest('biz-1', details);

    expect(channel).toBe('email');
    expect(sendWahaText).not.toHaveBeenCalled();
    expect(emailService.sendPaymentRequest).toHaveBeenCalledTimes(1);
  });

  it('falls back to email when the WhatsApp send fails', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          name: 'Demo Construction',
          phone: '+18765550000',
          email: 'hello@demo.test',
          waha_session_name: 'waha-demo',
          staff_phone: '+18765551111',
          staff_name: 'Jane Owner',
          staff_email: 'jane@demo.test',
        },
      ])
    );
    sendWahaText.mockRejectedValueOnce(new Error('WAHA send text failed: 500'));

    const channel = await notifyPaymentRequest('biz-1', details);

    expect(channel).toBe('email');
    expect(emailService.sendPaymentRequest).toHaveBeenCalledTimes(1);
  });

  it('reports no channel when the tenant has no contact details', async () => {
    mockQuery.mockResolvedValueOnce(
      rows([
        {
          name: 'Demo Construction',
          phone: null,
          email: null,
          waha_session_name: 'waha-demo',
          staff_phone: null,
          staff_name: null,
          staff_email: null,
        },
      ])
    );

    const channel = await notifyPaymentRequest('biz-1', details);

    expect(channel).toBe('none');
    expect(sendWahaText).not.toHaveBeenCalled();
    expect(emailService.sendPaymentRequest).not.toHaveBeenCalled();
  });
});

describe('email provider selection', () => {
  it('honours EMAIL_PROVIDER', () => {
    const original = config.email.provider;
    try {
      config.email.provider = 'resend';
      expect(getEmailProvider().id).toBe('resend');
      config.email.provider = 'smtp2go';
      expect(getEmailProvider().id).toBe('smtp2go');
      config.email.provider = 'brevo';
      expect(getEmailProvider().id).toBe('brevo');
      config.email.provider = 'sendgrid';
      expect(getEmailProvider().id).toBe('sendgrid');
    } finally {
      config.email.provider = original;
    }
  });

  it('falls back to the console provider for an unknown provider', () => {
    const original = config.email.provider;
    try {
      config.email.provider = 'does-not-exist';
      expect(getEmailProvider().id).toBe('console');
    } finally {
      config.email.provider = original;
    }
  });
});
