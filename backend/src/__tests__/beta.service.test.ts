import {
  validateBetaInvite,
  recordBetaRegistration,
  createBetaInvite,
  listBetaInvites,
  revokeBetaInvite,
  isBetaOpen,
  setBetaOpen,
  getBetaStatus,
} from '../services/beta.service';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

const mockQuery = require('../utils/database').query as jest.MockedFunction<typeof require('../utils/database').query>;

describe('Beta Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBetaInvite', () => {
    it('returns valid for a matching email invite', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'invite-1',
          email: 'user@example.com',
          domain: null,
          token: 'TOKEN123',
          invite_type: 'email',
          max_uses: 5,
          used_count: 2,
          expires_at: null,
          created_by: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await validateBetaInvite('user@example.com', 'TOKEN123');
      expect(result.valid).toBe(true);
      expect(result.inviteType).toBe('email');
    });

    it('returns invalid for non-matching email invite', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'invite-1',
          email: 'other@example.com',
          domain: null,
          token: 'TOKEN123',
          invite_type: 'email',
          max_uses: 5,
          used_count: 2,
          expires_at: null,
          created_by: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await validateBetaInvite('user@example.com', 'TOKEN123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('different email');
    });

    it('returns invalid for expired invite', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'invite-1',
          email: null,
          domain: null,
          token: 'PROMO1',
          invite_type: 'promo',
          max_uses: 100,
          used_count: 10,
          expires_at: new Date(Date.now() - 86400000),
          created_by: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await validateBetaInvite('user@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('returns invalid for exhausted invite', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'invite-1',
          email: null,
          domain: null,
          token: 'PROMO1',
          invite_type: 'promo',
          max_uses: 10,
          used_count: 10,
          expires_at: null,
          created_by: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await validateBetaInvite('user@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('usage limit');
    });

    it('returns invalid when no invite exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await validateBetaInvite('user@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No valid beta invite');
    });

    it('matches domain invite by email domain', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'invite-1',
          email: null,
          domain: 'acme.com',
          token: 'DOMAIN1',
          invite_type: 'domain',
          max_uses: 999,
          used_count: 5,
          expires_at: null,
          created_by: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await validateBetaInvite('boss@acme.com');
      expect(result.valid).toBe(true);
      expect(result.inviteType).toBe('domain');
    });
  });

  describe('createBetaInvite', () => {
    it('creates a new promo invite', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'invite-1',
          email: null,
          domain: null,
          token: 'NEWPROMO',
          invite_type: 'promo',
          max_uses: 50,
          used_count: 0,
          expires_at: null,
          created_by: null,
          metadata: { description: 'Test promo' },
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const invite = await createBetaInvite({
        token: 'NEWPROMO',
        inviteType: 'promo',
        maxUses: 50,
        metadata: { description: 'Test promo' },
      });

      expect(invite.token).toBe('NEWPROMO');
      expect(invite.invite_type).toBe('promo');
    });
  });

  describe('listBetaInvites', () => {
    it('returns all invites', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            email: null,
            domain: null,
            token: 'P1',
            invite_type: 'promo',
            max_uses: 100,
            used_count: 0,
            expires_at: null,
            created_by: null,
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const invites = await listBetaInvites();
      expect(invites).toHaveLength(1);
      expect(invites[0].token).toBe('P1');
    });
  });

  describe('revokeBetaInvite', () => {
    it('marks invite as exhausted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await revokeBetaInvite('TOKEN123');
      expect(mockQuery).toHaveBeenCalledWith(
        `UPDATE beta_invites SET max_uses = used_count, updated_at = NOW() WHERE token = $1`,
        ['TOKEN123']
      );
    });
  });

  describe('beta open/close', () => {
    it('returns open when setting is true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'true' }] });
      const open = await isBetaOpen();
      expect(open).toBe(true);
    });

    it('returns closed when setting is false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'false' }] });
      const open = await isBetaOpen();
      expect(open).toBe(false);
    });

    it('defaults to open when setting is missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const open = await isBetaOpen();
      expect(open).toBe(true);
    });

    it('toggles beta open state', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await setBetaOpen(false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['false']
      );
    });
  });
});
