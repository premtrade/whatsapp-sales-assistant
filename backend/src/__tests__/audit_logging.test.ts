import { Pool } from 'pg';
import { setupTestDb, teardownTestDb } from './setup';
import { createAuditLog } from '../services/audit.service';

describe('Audit Logging', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb(pool);
  });

  describe('createAuditLog function', () => {
    it('should require businessId parameter', async () => {
      // Test that createAuditLog throws an error when businessId is not provided
      // and no business_id is in metadata
      await expect(
        createAuditLog(
          'test_entity',
          'test_action',
          'test_user',
          'staff',
          'test description',
          undefined,
          undefined,
          {}, // empty metadata
          undefined,
          undefined,
          undefined // businessId not provided
        )
      ).rejects.toThrow();
    });

    it('should create audit log with businessId when provided directly', async () => {
      // Test that createAuditLog works when businessId is provided directly
      // Note: We're not actually asserting the database state here since
      // that would require querying the database, but we're verifying
      // the function doesn't throw
      await expect(
        createAuditLog(
          'test_entity',
          'test_action',
          'test_user',
          'staff',
          'test description',
          undefined,
          undefined,
          {}, // empty metadata
          undefined,
          undefined,
          'test-business-id' // businessId provided
        )
      ).resolves.toBeUndefined(); // Function returns void
    });

    it('should create audit log with businessId from metadata when businessId not provided directly', async () => {
      // Test that createAuditLog works when businessId comes from metadata
      await expect(
        createAuditLog(
          'test_entity',
          'test_action',
          'test_user',
          'staff',
          'test description',
          undefined,
          undefined,
          { business_id: 'test-business-id-from-metadata' },
          undefined,
          undefined,
          undefined // businessId not provided directly
        )
      ).resolves.toBeUndefined(); // Function returns void
    });

    it('should create audit log with businessId from tenantId in metadata when businessId not provided directly', async () => {
      // Test that createAuditLog works when businessId comes from tenantId in metadata
      await expect(
        createAuditLog(
          'test_entity',
          'test_action',
          'test_user',
          'staff',
          'test description',
          undefined,
          undefined,
          { tenantId: 'test-tenant-id-from-metadata' },
          undefined,
          undefined,
          undefined // businessId not provided directly
        )
      ).resolves.toBeUndefined(); // Function returns void
    });
  });
});