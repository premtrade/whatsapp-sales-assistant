import { WebSocketServer, WebSocket } from 'ws';
import { ApiResponse, WSMessage } from './types';

interface WSClient {
  ws: WebSocket;
  authenticated?: boolean;
  userId?: string;
}

const clients: Map<WebSocket, WSClient> = new Map();

let wss: WebSocketServer | null = null;

export function initializeWebSocket(server: any): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.set(ws, { ws, authenticated: false });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        const client = clients.get(ws);
        if (message.type === 'auth' && message.payload && typeof message.payload === 'object' && 'token' in message.payload) {
          const token = message.payload.token;
          if (token) {
            import('./services/auth.service').then(({ validateToken }) => {
              return validateToken(token);
            }).then((user) => {
              if (user) {
                clients.set(ws, { ws, authenticated: true, userId: user.id });
                ws.send(JSON.stringify({ type: 'auth_success', payload: { message: 'Authenticated' } }));
              } else {
                ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Invalid token' } }));
                ws.close(4001, 'Unauthorized');
              }
            }).catch((error) => {
              ws.send(JSON.stringify({ type: 'auth_error', payload: { message: 'Authentication error' } }));
              ws.close(4001, 'Unauthorized');
            });
          }
        }
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });
}

function broadcast(message: WSMessage): void {
  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  });
}

export async function emitNewMessage(conversationId: string, message: unknown): Promise<void> {
  broadcast({ type: 'new_message', payload: { conversationId, message }, timestamp: new Date().toISOString() });
}

export async function emitHandoffCreated(handoff: unknown): Promise<void> {
  broadcast({ type: 'new_handoff', payload: handoff, timestamp: new Date().toISOString() });
}

export async function emitHandoffUpdated(handoff: unknown): Promise<void> {
  broadcast({ type: 'handoff_updated', payload: handoff, timestamp: new Date().toISOString() });
}

export async function emitConversationStatusUpdated(conversation: unknown): Promise<void> {
  broadcast({ type: 'conversation_updated', payload: conversation, timestamp: new Date().toISOString() });
}

export async function emitDashboardStatsUpdated(stats?: unknown): Promise<void> {
  broadcast({ type: 'dashboard_stats_updated', payload: stats, timestamp: new Date().toISOString() });
}

setInterval(async () => {
  try {
    const { getPendingHandoffs } = await import('./services/handoff.service');
    const handoffs = await getPendingHandoffs(10);
    if (handoffs.length > 0) {
      broadcast({ type: 'handoffs_pending', payload: { count: handoffs.length, handoffs }, timestamp: new Date().toISOString() });
    }
  } catch (error) {
    console.error('Error broadcasting pending handoffs', { error });
  }
}, 30000);

export function getConnectedClientsCount(): number {
  return clients.size;
}

export function isClientAuthenticated(ws: WebSocket): boolean {
  return clients.get(ws)?.authenticated === true;
}

export function getClientUserId(ws: WebSocket): string | undefined {
  return clients.get(ws)?.userId;
}