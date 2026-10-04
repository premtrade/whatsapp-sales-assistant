import { createContactInquiry, listContactInquiries } from '../services/contact-inquiry.service';
import { query } from '../utils/database';

jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.Mock;

describe('Contact Inquiry Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createContactInquiry', () => {
    it('creates a contact inquiry and returns it', async () => {
      const mockInquiry = {
        id: 'inquiry-1',
        name: 'John Doe',
        business: 'Acme Corp',
        email: 'john@example.com',
        whatsapp: '+18765551234',
        message: 'I need a quote',
        source: 'landing-page',
        ip_address: null,
        user_agent: null,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockInquiry],
        rowCount: 1,
      } as any);

      const result = await createContactInquiry({
        name: 'John Doe',
        business: 'Acme Corp',
        email: 'john@example.com',
        whatsapp: '+18765551234',
        message: 'I need a quote',
      });

      expect(result.id).toBe('inquiry-1');
      expect(result.email).toBe('john@example.com');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('normalizes email to lowercase', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'inquiry-2',
          name: 'Jane',
          business: null,
          email: 'jane@example.com',
          whatsapp: null,
          message: 'Hello',
          source: 'landing-page',
          ip_address: null,
          user_agent: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      await createContactInquiry({
        name: 'Jane',
        email: 'JANE@EXAMPLE.COM',
        message: 'Hello',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['jane@example.com'])
      );
    });

    it('throws when inquiry creation returns no rows', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(
        createContactInquiry({
          name: 'Test',
          email: 'test@example.com',
          message: 'Test message',
        })
      ).rejects.toThrow('Failed to create contact inquiry');
    });
  });

  describe('listContactInquiries', () => {
    it('returns paginated inquiries', async () => {
      const mockInquiries = [
        {
          id: '1',
          name: 'User 1',
          business: null,
          email: 'user1@example.com',
          whatsapp: null,
          message: 'Message 1',
          source: 'landing-page',
          ip_address: null,
          user_agent: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '2',
          name: 'User 2',
          business: null,
          email: 'user2@example.com',
          whatsapp: null,
          message: 'Message 2',
          source: 'landing-page',
          ip_address: null,
          user_agent: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: mockInquiries, rowCount: 2 } as any);

      const result = await listContactInquiries({ page: 1, limit: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(50);
    });

    it('filters by source when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await listContactInquiries({ page: 1, limit: 50, source: 'landing-page' });

      expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE source = $1'), ['landing-page']);
    });
  });
});
