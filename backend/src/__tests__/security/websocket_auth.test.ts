import { IncomingMessage } from 'http';

// Mock the ws module: the real WebSocketServer constructor requires a live
// http.Server (it calls server.on(...)), so we replace it with a controllable
// fake whose connection handler tests can invoke directly.
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(),
  WebSocket: { OPEN: 1, CONNECTING: 0, CLOSING: 2, CLOSED: 3 },
}));

jest.mock('../../services/auth.service', () => ({
  validateToken: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import {
  initializeWebSocket,
  broadcastToTenant,
  emitNewMessage,
  emitHandoffCreated,
  emitHandoffUpdated,
  emitConversationStatusUpdated,
  emitDashboardStatsUpdated,
} from '../../websocketServer';
import { WebSocketServer } from 'ws';
import { validateToken, StaffUser } from '../../services/auth.service';

// Fake WebSocketServer instance handed to initializeWebSocket
const mockWss = { on: jest.fn() };

const getConnectionHandler = ():
  | ((ws: unknown, req: Partial<IncomingMessage>) => Promise<void>)
  | undefined =>
  mockWss.on.mock.calls.find((call) => call[0] === 'connection')?.[1] as any;

describe('websocketServer', () => {
  let mockWs: {
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };
  let wsHandlers: Record<string, (...args: unknown[]) => void>;
  let mockValidateToken: jest.MockedFunction<typeof validateToken>;

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

  const connect = async (url: string): Promise<void> => {
    const handler = getConnectionHandler();
    expect(handler).toBeDefined();
    await handler!(mockWs as unknown as { readyState: number }, { url } as unknown as IncomingMessage);
  };

  const sendJson = async (message: unknown): Promise<void> => {
    await wsHandlers.message!(Buffer.from(JSON.stringify(message)));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (WebSocketServer as unknown as jest.Mock).mockImplementation(() => mockWss);
    mockValidateToken = validateToken as jest.MockedFunction<typeof validateToken>;

    wsHandlers = {};
    mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        wsHandlers[event] = handler;
      }),
    };
  });

  afterEach(() => {
    // Detach the client from the module-level clients map so tests stay isolated
    wsHandlers.close?.();
  });

  describe('WebSocket Authentication', () => {
    it('rejects connection without token and times out after 5s', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      initializeWebSocket({} as any);
      await connect('/ws');

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      setTimeoutSpy.mockRestore();
    });

    it('accepts valid token via query parameter', async () => {
      mockValidateToken.mockResolvedValue(createMockUser({ role: 'admin', business_id: 'tenant-1' }));

      initializeWebSocket({} as any);
      await connect('/ws?token=valid-token');

      expect(mockValidateToken).toHaveBeenCalledWith('valid-token');
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('auth_success'));
      expect(mockWs.close).not.toHaveBeenCalled();
    });

    it('rejects invalid token via query parameter', async () => {
      mockValidateToken.mockResolvedValue(null);

      initializeWebSocket({} as any);
      await connect('/ws?token=invalid-token');

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('auth_error'));
      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    });

    it('accepts valid token via auth message', async () => {
      mockValidateToken.mockResolvedValue(createMockUser({ role: 'admin', business_id: 'tenant-1' }));

      initializeWebSocket({} as any);
      await connect('/ws');
      await sendJson({ type: 'auth', payload: { token: 'valid-token' } });

      expect(mockValidateToken).toHaveBeenCalledWith('valid-token');
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('auth_success'));
    });

    it('rejects auth message without token', async () => {
      initializeWebSocket({} as any);
      await connect('/ws');
      await sendJson({ type: 'auth', payload: {} });

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('auth_error'));
      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    });

    it('rejects non-auth messages from unauthenticated clients', async () => {
      initializeWebSocket({} as any);
      await connect('/ws');
      await sendJson({ type: 'some_action', payload: {} });

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('auth_error'));
      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Authentication required');
    });
  });

  describe('Tenant-scoped broadcasting', () => {
    it('broadcastToTenant requires tenantId', () => {
      expect(() =>
        broadcastToTenant('', { type: 'test', payload: {}, timestamp: new Date().toISOString() })
      ).toThrow('targetTenantId is required for broadcastToTenant');
    });

    it('broadcastToTenant throws for undefined tenantId', () => {
      expect(() =>
        broadcastToTenant(undefined as any, { type: 'test', payload: {}, timestamp: new Date().toISOString() })
      ).toThrow('targetTenantId is required for broadcastToTenant');
    });

    it('broadcasts only to clients in target tenant', async () => {
      mockValidateToken.mockResolvedValue(createMockUser({ role: 'admin', business_id: 'tenant-1' }));

      initializeWebSocket({} as any);
      await connect('/ws?token=valid-token');
      mockWs.send.mockClear();

      // Different tenant: must NOT receive the message
      await emitNewMessage('tenant-2', 'conv-1', { text: 'hello' });
      expect(mockWs.send).not.toHaveBeenCalled();

      // Same tenant: must receive the message
      await emitNewMessage('tenant-1', 'conv-1', { text: 'hello' });
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('new_message'));
    });
  });

  describe('Emit functions require tenantId', () => {
    it('emitNewMessage requires tenantId', async () => {
      await expect(emitNewMessage('', 'conv-1', { text: 'hello' })).rejects.toThrow(
        'tenantId is required for emitNewMessage'
      );
    });

    it('emitHandoffCreated requires tenantId', async () => {
      await expect(emitHandoffCreated({}, '')).rejects.toThrow(
        'tenantId is required for emitHandoffCreated'
      );
    });

    it('emitHandoffUpdated requires tenantId', async () => {
      await expect(emitHandoffUpdated({}, '')).rejects.toThrow(
        'tenantId is required for emitHandoffUpdated'
      );
    });

    it('emitConversationStatusUpdated requires tenantId', async () => {
      await expect(emitConversationStatusUpdated({}, '')).rejects.toThrow(
        'tenantId is required for emitConversationStatusUpdated'
      );
    });

    it('emitDashboardStatsUpdated requires tenantId', async () => {
      await expect(emitDashboardStatsUpdated({}, '')).rejects.toThrow(
        'tenantId is required for emitDashboardStatsUpdated'
      );
    });
  });

  describe('Rate limiting', () => {
    it('closes connection after MAX_MESSAGES_PER_MINUTE', async () => {
      mockValidateToken.mockResolvedValue(createMockUser({ role: 'admin', business_id: 'tenant-1' }));

      initializeWebSocket({} as any);
      await connect('/ws?token=valid-token');
      mockWs.send.mockClear();
      mockWs.close.mockClear();

      // Send MAX_MESSAGES_PER_MINUTE + 1 messages
      for (let i = 0; i <= 60; i++) {
        await sendJson({ type: 'ping' });
      }

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('Rate limit exceeded'));
      expect(mockWs.close).toHaveBeenCalledWith(4008, 'Rate limit exceeded');
    });
  });
});
