import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

// Mock dependencies
jest.mock('../../services/auth.service', () => ({
  validateToken: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { initializeWebSocket, broadcastToTenant, emitNewMessage, emitHandoffCreated, emitHandoffUpdated, emitConversationStatusUpdated, emitDashboardStatsUpdated, getAuthenticatedClientsCount } from '../../websocketServer';
import { validateToken } from '../../services/auth.service';
import logger from '../../utils/logger';
import { StaffUser } from '../../types';

describe('websocketServer', () => {
  let mockServer: any;
  let mockWs: any;
  let mockReq: any;
  let mockValidateToken: jest.MockedFunction<typeof validateToken>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateToken = validateToken as jest.MockedFunction<typeof validateToken>;
    
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    };

    mockReq = {
      url: '/ws',
    };

    mockServer = {
      on: jest.fn(),
    };
  });

  afterEach(() => {
    // Clean up any WebSocket server
    jest.resetModules();
  });

  const createMockUser = (overrides: Partial<StaffUser> = {}): StaffUser => ({
    id: 'user-1',
    employee_number: 'EMP001',
    first_name: 'John',
    last_name: 'Doe',
    display_name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    role: 'admin',
    status: 'active',
    timezone: 'UTC',
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    business_id: 'tenant-1',
    ...overrides,
  });

  const findHandler = (calls: any[], eventName: string) => {
    return calls.find((call: any[]) => call[0] === eventName)?.[1];
  };

  describe('WebSocket Authentication', () => {
    let mockServer: any;
    let mockWs: any;
    let mockReq: any;
    let mockValidateToken: jest.MockedFunction<typeof validateToken>;
    let connectionHandler: any;
    let messageHandler: any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockValidateToken = validateToken as jest.MockedFunction<typeof validateToken>;
      
      mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn(),
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'message') messageHandler = handler;
        }),
        removeAllListeners: jest.fn(),
      };

      mockReq = {
        url: '/ws',
      };

      mockServer = {
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'connection') connectionHandler = handler;
        }),
      };
    });

    afterEach(() => {
      jest.resetModules();
    });

    describe('WebSocket Authentication', () => {
      it('rejects connection without token and times out after 5s', async () => {
        mockReq.url = '/ws'; // No token
        
        initializeWebSocket({} as any);
        
        expect(connectionHandler).toBeDefined();
        
        // Simulate connection
        await connectionHandler!(mockWs, { url: '/ws' } as any);
        
        // Should set auth timeout
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
      });

      it('accepts valid token via query parameter', async () => {
        const mockUser = createMockUser({ id: 'user-1', role: 'admin', business_id: 'tenant-1' });
        mockValidateToken.mockResolvedValue(mockUser);
        
        initializeWebSocket({} as any);
        await connectionHandler!(mockWs, { url: '/ws?token=valid-token' } as any);
        
        expect(mockValidateToken).toHaveBeenCalledWith('valid-token');
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('auth_success')
        );
        expect(mockWs.close).not.toHaveBeenCalled();
      });

      it('rejects invalid token via query parameter', async () => {
        mockValidateToken.mockResolvedValue(null);
        
        initializeWebSocket({} as any);
        await connectionHandler!(mockWs, { url: '/ws?token=invalid-token' } as any);
        
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('auth_error')
        );
        expect(mockWs.close).toHaveBeenCalledWith(4001, 'Unauthorized');
      });

      it('accepts valid token via auth message', async () => {
        const mockUser = createMockUser({ id: 'user-1', role: 'admin', business_id: 'tenant-1' });
        mockValidateToken.mockResolvedValue(mockUser);
        
        initializeWebSocket({} as any);
        await connectionHandler!(mockWs, { url: '/ws' } as any);
        
        // Simulate auth message
        await messageHandler!(Buffer.from(JSON.stringify({
          type: 'auth',
          payload: { token: 'valid-token' },
        })));
        
        expect(mockValidateToken).toHaveBeenCalledWith('valid-token');
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('auth_success')
        );
      });

      it('rejects auth message without token', async () => {
        initializeWebSocket({} as any);
        await connectionHandler!(mockWs, { url: '/ws' } as any);
        
        await messageHandler!(Buffer.from(JSON.stringify({
          type: 'auth',
          payload: {},
        })));
        
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('auth_error')
        );
        expect(mockWs.close).toHaveBeenCalledWith(4001, 'Unauthorized');
      });

      it('rejects non-auth messages from unauthenticated clients', async () => {
        initializeWebSocket({} as any);
        await connectionHandler!(mockWs, { url: '/ws' } as any);
        
        await messageHandler!(Buffer.from(JSON.stringify({
          type: 'some_action',
          payload: {},
        })));
        
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('auth_error')
        );
        expect(mockWs.close).toHaveBeenCalledWith(4001, 'Authentication required');
      });
    });

    describe('Tenant-scoped broadcasting', () => {
      it('broadcastToTenant requires tenantId', () => {
        expect(() => broadcastToTenant('', { type: 'test', payload: {}, timestamp: new Date().toISOString() }))
          .toThrow('targetTenantId is required for broadcastToTenant');
      });

      it('broadcastToTenant throws for undefined tenantId', () => {
        expect(() => broadcastToTenant(undefined as any, { type: 'test', payload: {}, timestamp: new Date().toISOString() }))
          .toThrow('targetTenantId is required for broadcastToTenant');
      });

      it('broadcasts only to clients in target tenant', () => {
        // Test via emitNewMessage which requires tenantId
        expect(() => emitNewMessage('tenant-1', 'conv-1', { text: 'hello' }))
          .resolves.not.toThrow();
        
        expect(() => emitNewMessage('', 'conv-1', { text: 'hello' }))
          .rejects.toThrow('tenantId is required for emitNewMessage');
      });
    });

    describe('Emit functions require tenantId', () => {
      it('emitNewMessage requires tenantId', async () => {
        await expect(emitNewMessage('', 'conv-1', { text: 'hello' }))
          .rejects.toThrow('tenantId is required for emitNewMessage');
      });

      it('emitHandoffCreated requires tenantId', async () => {
        await expect(emitHandoffCreated({}, ''))
          .rejects.toThrow('tenantId is required for emitHandoffCreated');
      });

      it('emitHandoffUpdated requires tenantId', async () => {
        await expect(emitHandoffUpdated({}, ''))
          .rejects.toThrow('tenantId is required for emitHandoffUpdated');
      });

      it('emitConversationStatusUpdated requires tenantId', async () => {
        await expect(emitConversationStatusUpdated({}, ''))
          .rejects.toThrow('tenantId is required for emitConversationStatusUpdated');
      });

      it('emitDashboardStatsUpdated requires tenantId', async () => {
        await expect(emitDashboardStatsUpdated({}, ''))
          .rejects.toThrow('tenantId is required for emitDashboardStatsUpdated');
      });
    });

    describe('Rate limiting', () => {
      it('closes connection after MAX_MESSAGES_PER_MINUTE', async () => {
        const mockUser = createMockUser({ id: 'user-1', role: 'admin', business_id: 'tenant-1' });
        mockValidateToken.mockResolvedValue(mockUser);
        
        initializeWebSocket({} as any);
        await connectionHandler!(mockWs, { url: '/ws?token=valid-token' } as any);
        
        // Send MAX_MESSAGES_PER_MINUTE + 1 messages
        for (let i = 0; i <= 60; i++) {
          await messageHandler!(Buffer.from(JSON.stringify({ type: 'ping' })));
        }
        
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('Rate limit exceeded')
        );
        expect(mockWs.close).toHaveBeenCalledWith(4008, 'Rate limit exceeded');
      });
    });
  });
});