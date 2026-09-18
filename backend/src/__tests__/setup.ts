// Jest setup file for backend tests
import { config } from '../config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.WAHA_API_KEY = 'test-waha-api-key';
process.env.WAHA_WEBHOOK_SECRET = 'test-waha-webhook-secret';
process.env.N8N_WEBHOOK_SECRET = 'test-n8n-webhook-secret';
process.env.N8N_ENCRYPTION_KEY = 'test-n8n-encryption-key-32chars!!';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_DB = 'test_db';
process.env.POSTGRES_USER = 'test';
process.env.POSTGRES_PASSWORD = 'test';

// Mock config
jest.mock('../config', () => ({
  config: {
    env: 'test',
    port: 4000,
    corsOrigins: ['http://localhost:3000'],
    logLevel: 'silent',
    postgres: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test',
      password: 'test',
      schema: 'public',
    },
    jwt: {
      secret: 'test-jwt-secret-key-for-testing-only',
      expiresIn: '1d',
    },
    waha: {
      apiKey: 'test-waha-api-key',
      host: 'localhost',
      port: 3000,
      session: 'default',
    },
    n8n: {
      host: 'localhost',
      port: 5678,
    },
    gemini: {
      apiKey: '',
    },
  },
}));

// Test database setup functions
// In a real implementation, these would set up and tear down a test database
// For now, we're providing placeholder implementations
export const setupTestDb = async () => {
  // In a real test, we would:
  // 1. Create a test database connection pool
  // 2. Run any necessary migrations
  // 3. Return the pool for use in tests
  // For now, we'll return a mock pool
  return {
    query: async (text: string, params?: any[]) => {
      // Mock implementation - in real tests, this would query the database
      return { rows: [] };
    },
    end: async () => {
      // Mock implementation - in real tests, this would close the pool
    }
  } as any;
};

export const teardownTestDb = async (pool: any) => {
  // In a real test, we would:
  // 1. Close the database connection pool
  // 2. Drop the test database
  // For now, we'll just call end on the pool
  if (pool && typeof pool.end === 'function') {
    await pool.end();
  }
};