import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { WSMessage } from './types';
import logger from './utils/logger';

interface WSClient {
  ws: WebSocket;
  authenticated: boolean;
  userId?: string;
  role?: string;
  tenantId?: string;
  businessId?: string;
  messageCount: number;
  lastMessageReset: number;
}

const clients: Map<WebSocket, WSClient> = new Map();
const AUTH_TIMEOUT_MS = 5000;
const MAX_MESSAGES_PER_MINUTE = 60;

let wss: WebSocketServer | null = null;

export function initializeWebSocket(server: any): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const clientState: WSClient = {
      ws,
      authenticated: false,
      messageCount: 0,
      lastMessageReset: Date.now(),
    };
    clients.set(ws, clientState);

    let authTimeout: NodeJS.Timeout | null = null;

    // Check query params for instant token authentication e.g. /ws?token=...
    try {
      if (req.url) {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const queryToken = parsedUrl.searchParams.get('token');
        if (queryToken) {
          const { validateToken } = await import('./services/auth.service');
          const user = await validateToken(queryToken);
          if (user) {
            clientState.authenticated = true;
            clientState.userId = user.id;
            clientState.role = user.role;
            clientState.tenantId = user.business_id;
            clientState.businessId = user.business_id;
            ws.send(JSON.stringify({
              type: 'auth_success',
              payload: {
                message: 'Authenticated successfully',
                userId: user.id,
                tenantId: user.business_id,
              },
            }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Invalid token' } }));
            ws.close(4001, 'Unauthorized');
            clients.delete(ws);
            return;
          }
        }
      }
    } catch (err) {
      logger.error('WebSocket handshake authentication error', { error: err });
    }

    if (!clientState.authenticated) {
      authTimeout = setTimeout(() => {
        const client = clients.get(ws);
        if (client && !client.authenticated) {
          logger.warn('WebSocket connection closed due to authentication timeout');
          try {
            ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Authentication timeout' } }));
            ws.close(4001, 'Authentication required');
          } catch {}
          clients.delete(ws);
        }
      }, AUTH_TIMEOUT_MS);
    }

    ws.on('message', async (data: Buffer) => {
      const client = clients.get(ws);
      if (!client) return;

      // Rate limit incoming messages per socket
      const now = Date.now();
      if (now - client.lastMessageReset > 60000) {
        client.messageCount = 0;
        client.lastMessageReset = now;
      }
      client.messageCount++;
      if (client.messageCount > MAX_MESSAGES_PER_MINUTE) {
        logger.warn('WebSocket client rate limit exceeded', { userId: client.userId });
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Rate limit exceeded' } }));
        ws.close(4008, 'Rate limit exceeded');
        clients.delete(ws);
        return;
      }

      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON message format' } }));
        return;
      }

      // Reject non-auth messages for unauthenticated clients
      if (!client.authenticated && message.type !== 'auth') {
        logger.warn('Unauthorized WebSocket message rejected');
        ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Authentication required' } }));
        ws.close(4001, 'Authentication required');
        clients.delete(ws);
        return;
      }

      if (message.type === 'auth') {
        const token = message.payload?.token;
        if (!token || typeof token !== 'string') {
          ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Missing token in auth payload' } }));
          ws.close(4001, 'Unauthorized');
          clients.delete(ws);
          return;
        }

        try {
          const { validateToken } = await import('./services/auth.service');
          const user = await validateToken(token);
          if (user) {
            if (authTimeout) {
              clearTimeout(authTimeout);
              authTimeout = null;
            }
            client.authenticated = true;
            client.userId = user.id;
            client.role = user.role;
            client.tenantId = user.business_id;
            client.businessId = user.business_id;
            ws.send(JSON.stringify({
              type: 'auth_success',
              payload: {
                message: 'Authenticated successfully',
                userId: user.id,
                tenantId: user.business_id,
              },
            }));
            logger.info('WebSocket client authenticated', { userId: user.id, tenantId: user.business_id });
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Invalid or expired token' } }));
            ws.close(4001, 'Unauthorized');
            clients.delete(ws);
          }
        } catch (error) {
          logger.error('WebSocket token validation error', { error });
          ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Authentication failed' } }));
          ws.close(4001, 'Unauthorized');
          clients.delete(ws);
        }
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    });

    ws.on('close', () => {
      if (authTimeout) {
        clearTimeout(authTimeout);
      }
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket client connection error', { error: err });
      if (authTimeout) {
        clearTimeout(authTimeout);
      }
      clients.delete(ws);
    });
  });
}

/**
 * Broadcasts an event strictly to authenticated clients belonging to a specific tenant.
 * targetTenantId is REQUIRED - no global fallback.
 */
export function broadcastToTenant(targetTenantId: string, message: WSMessage): void {
  if (!targetTenantId) {
    throw new Error('targetTenantId is required for broadcastToTenant');
  }
  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
      if (client.tenantId === targetTenantId) {
        try {
          client.ws.send(messageStr);
        } catch (err) {
          logger.error('Failed to send WebSocket message to client', { error: err, userId: client.userId });
        }
      }
    }
  });
}

export async function emitNewMessage(
  tenantId: string,
  conversationId: string,
  message: unknown
): Promise<void> {
  if (!tenantId) {
    throw new Error('tenantId is required for emitNewMessage');
  }
  broadcastToTenant(tenantId, {
    type: 'new_message',
    payload: { conversationId, message },
    timestamp: new Date().toISOString(),
  });
}

export async function emitHandoffCreated(handoff: any, tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new Error('tenantId is required for emitHandoffCreated');
  }
  broadcastToTenant(tenantId, { type: 'new_handoff', payload: handoff, timestamp: new Date().toISOString() });
}

export async function emitHandoffUpdated(handoff: any, tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new Error('tenantId is required for emitHandoffUpdated');
  }
  broadcastToTenant(tenantId, { type: 'handoff_updated', payload: handoff, timestamp: new Date().toISOString() });
}

export async function emitConversationStatusUpdated(conversation: any, tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new Error('tenantId is required for emitConversationStatusUpdated');
  }
  broadcastToTenant(tenantId, { type: 'conversation_updated', payload: conversation, timestamp: new Date().toISOString() });
}

export async function emitDashboardStatsUpdated(stats: unknown, tenantId: string): Promise<void> {
  if (!tenantId) {
    throw new Error('tenantId is required for emitDashboardStatsUpdated');
  }
  broadcastToTenant(tenantId, { type: 'dashboard_stats_updated', payload: stats, timestamp: new Date().toISOString() });
}

export function getConnectedClientsCount(): number {
  return clients.size;
}

export function getAuthenticatedClientsCount(): number {
  let count = 0;
  clients.forEach((c) => {
    if (c.authenticated) count++;
  });
  return count;
}

export function isClientAuthenticated(ws: WebSocket): boolean {
  return clients.get(ws)?.authenticated === true;
}

export function getClientUserId(ws: WebSocket): string | undefined {
  return clients.get(ws)?.userId;
}

export function getClientTenantId(ws: WebSocket): string | undefined {
  return clients.get(ws)?.tenantId;
}