import bcrypt from 'bcryptjs';
import { query } from '../utils/database';
import { login, StaffUser } from '../services/auth.service';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.Mock;

describe('Platform owner login', () => {
  it('normalizes email and accepts an existing $2a bcrypt hash', async () => {
    const plainPassword = 'LocalTestPassword!42';
    const modernHash = await bcrypt.hash(plainPassword, 4);
    const existingBcryptHash = modernHash.replace(/^\$2b\$/, '$2a$');
    const user: StaffUser = {
      id: 'owner-1',
      employee_number: 'OWNER-001',
      first_name: 'Platform',
      last_name: 'Owner',
      display_name: 'Platform Owner',
      email: 'owner@waflo.app',
      phone: '',
      role: 'super_admin',
      status: 'active',
      timezone: 'America/Jamaica',
      metadata: {},
      password_hash: existingBcryptHash,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      business_id: 'business-1',
    };

    mockQuery.mockResolvedValueOnce({ rows: [user] });

    const response = await login({ email: ' OWNER@WAFLO.APP ', password: plainPassword });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(email::text) = $1'),
      ['owner@waflo.app']
    );
    expect(response.user).not.toHaveProperty('password_hash');
    expect(response.user.role).toBe('super_admin');
    expect(response.token).toBeTruthy();
  });
});
