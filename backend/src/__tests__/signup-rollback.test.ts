import { query } from '../utils/database';
import { signupBusiness } from '../services/public.service';
import { createBusiness } from '../services/business.service';
import { createTrial } from '../services/subscription.service';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/business.service', () => ({
  ...jest.requireActual('../services/business.service'),
  createBusiness: jest.fn(),
  getBusinessBySlug: jest.fn().mockResolvedValue(null),
  getBusinessByWhatsAppPhone: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/subscription.service', () => ({
  ...jest.requireActual('../services/subscription.service'),
  createTrial: jest.fn(),
}));

jest.mock('../services/beta.service', () => ({
  validateBetaInvite: jest.fn().mockResolvedValue({ valid: false }),
  recordBetaRegistration: jest.fn(),
  consumeBetaInvite: jest.fn(),
  isBetaOpen: jest.fn().mockResolvedValue(true),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreateBusiness = createBusiness as jest.Mock;
const mockCreateTrial = createTrial as jest.Mock;

const BUSINESS_ID = '11111111-2222-3333-4444-555555555555';

function baseSignup() {
  return {
    businessName: 'Mckoys auto imports ltd',
    slug: 'mckoysauto',
    whatsappPhone: '+18764338789',
    ownerName: 'Noel Mckoy',
    email: 'mckoysautojamaica@gmail.com',
    password: 'Password1',
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockCreateBusiness.mockReset().mockResolvedValue({
    id: BUSINESS_ID,
    name: 'Mckoys auto imports ltd',
    slug: 'mckoysauto',
    status: 'trialing',
    whatsapp_phone: '+18764338789',
    waha_session_name: 'waha-mckoysauto',
    currency: 'USD',
    timezone: 'America/Jamaica',
  } as any);
  mockCreateTrial.mockReset();
  // Any staff insert returns a row; the settings inserts are not interesting.
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO staff_users')) {
      return {
        rows: [
          {
            id: 'staff-1',
            employee_number: 'EMP-111111',
            first_name: 'Noel',
            last_name: 'Mckoy',
            email: 'mckoysautojamaica@gmail.com',
            role: 'admin',
            status: 'active',
            timezone: 'America/Jamaica',
            business_id: BUSINESS_ID,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });
});

describe('signup', () => {
  it('creates the trial before anything else that depends on it', async () => {
    mockCreateTrial.mockResolvedValue({ id: 'sub-1', status: 'trialing' } as any);

    await signupBusiness(baseSignup());

    expect(mockCreateTrial).toHaveBeenCalledWith(BUSINESS_ID, 'starter');
  });

  /**
   * The regression that cost us a real prospect.
   *
   * On 8 October 2026 the trial insert failed with a 42P10 and the business
   * row was left behind. Because businesses.whatsapp_phone is unique, that
   * orphan made the customer unable to sign up again with the same number.
   */
  it('removes the tenant when the trial subscription cannot be created', async () => {
    mockCreateTrial.mockRejectedValue(new Error('Failed to create trial subscription'));

    await expect(signupBusiness(baseSignup())).rejects.toThrow('Failed to create trial subscription');

    const rollback = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('DELETE FROM businesses')
    );
    expect(rollback).toBeDefined();
    expect(rollback![1]).toEqual([BUSINESS_ID]);
  });

  it('removes the tenant when the owner account cannot be created', async () => {
    mockCreateTrial.mockResolvedValue({ id: 'sub-1', status: 'trialing' } as any);
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO staff_users')) {
        return { rows: [], rowCount: 0 } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    });

    await expect(signupBusiness(baseSignup())).rejects.toThrow('Failed to create staff user');

    const rollback = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('DELETE FROM businesses')
    );
    expect(rollback).toBeDefined();
    expect(rollback![1]).toEqual([BUSINESS_ID]);
  });

  it('does not roll back a successful signup', async () => {
    mockCreateTrial.mockResolvedValue({ id: 'sub-1', status: 'trialing' } as any);

    const result = await signupBusiness(baseSignup());

    expect(result.business.slug).toBe('mckoysauto');
    expect(result.user.email).toBe('mckoysautojamaica@gmail.com');
    const rollback = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('DELETE FROM businesses')
    );
    expect(rollback).toBeUndefined();
  });
});
