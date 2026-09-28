/**
 * Vercel Function WebSocket relay.
 *
 * Why this exists
 * ---------------
 * `frontend/vercel.json` used to rewrite `/ws` straight to the Droplet over plain
 * HTTP. Vercel only supports WebSocket upgrades for Functions inside the project,
 * not for rewrites to external origins, and a page served over HTTPS cannot open a
 * `ws://` socket (mixed content). So the browser talks to this function instead, and
 * the function - which runs server-side - holds a WebSocket to the Fastify API.
 *
 * Request flow
 * ------------
 *   browser  --wss://waflo.vercel.app/ws?token=...-->  this function  --ws://droplet/ws?token=-->  backend
 *
 * The bridge is a transparent pipe: the Fastify WebSocket server already
 * authenticates the socket (`?token=` or a `{type:'auth'}` message), scopes events
 * to the caller's tenant and replies to `{type:'ping'}` with `pong`, so no protocol
 * logic lives here. Close codes are forwarded in both directions so the client can
 * tell "bad token" (4001 -> stop, re-login) from "connection dropped" (retry).
 *
 * Configuration
 * -------------
 *   BACKEND_WS_URL  Vercel env var, upstream WebSocket endpoint.
 *                   Default: ws://206.189.179.60/ws (host nginx on :80 -> 127.0.0.1:4000/ws)
 *                   When the API gets its own TLS hostname, set this to
 *                   wss://api.<your-domain>/ws and this relay can be deleted.
 */
import WebSocket, { type RawData } from 'ws';
import { experimental_upgradeWebSocket } from '@vercel/functions';

const DEFAULT_UPSTREAM = 'ws://206.189.179.60/ws';
const UPSTREAM_TIMEOUT_MS = 5_000;
const MAX_PAYLOAD_BYTES = 1024 * 1024;

function jsonResponse(status: number, message: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ success: false, message, ...extra }), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Builds the upstream URL for a given browser request, preserving the query string
 * (carries `?token=` for instant authentication on the Fastify side).
 */
export function resolveUpstreamUrl(
  requestUrl: string,
  upstreamBase: string = process.env.BACKEND_WS_URL || DEFAULT_UPSTREAM
): string {
  const incoming = new URL(requestUrl, 'https://realtime.local');
  const upstream = new URL(upstreamBase);
  upstream.search = incoming.search;
  return upstream.toString();
}

function connectUpstream(url: string): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, { handshakeTimeout: UPSTREAM_TIMEOUT_MS });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`upstream connect timeout after ${UPSTREAM_TIMEOUT_MS}ms`));
    }, UPSTREAM_TIMEOUT_MS);

    socket.once('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Transparently pipes frames between the browser socket and the upstream socket.
 * Resolves only when one of the two sides has closed (keeps the function alive for
 * the lifetime of the connection).
 */
export function bridge(client: WebSocket, upstream: WebSocket): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      try {
        if (client.readyState === WebSocket.OPEN) client.close();
      } catch {
        /* ignore */
      }
      try {
        if (upstream.readyState === WebSocket.OPEN) upstream.close();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const earlyFrames: Array<{ data: RawData; isBinary: boolean }> = [];
    const bufferEarly = (data: RawData, isBinary: boolean): void => {
      earlyFrames.push({ data, isBinary });
    };
    upstream.on('message', bufferEarly);

    const flushEarly = (): void => {
      upstream.off('message', bufferEarly);
      for (const frame of earlyFrames) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(frame.data, { binary: frame.isBinary });
        }
      }
    };

    client.on('message', (data: RawData, isBinary: boolean) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    });

    upstream.on('message', (data: RawData, isBinary: boolean) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });

    // If client is already open, flush immediately; otherwise flush once open.
    if (client.readyState === WebSocket.OPEN) {
      flushEarly();
    } else {
      client.once('open', flushEarly);
    }

    // Forward close codes/reasons so the browser can distinguish auth failures (4001) from drops.
    client.on('close', (code: number, reason: Buffer) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason);
      finish();
    });

    upstream.on('close', (code: number, reason: Buffer) => {
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      finish();
    });

    client.on('error', finish);
    upstream.on('error', finish);
  });
}

export async function handleRequest(request: Request): Promise<Response> {
  const upgrade = (request.headers.get('upgrade') || '').toLowerCase();
  if (upgrade !== 'websocket') {
    return jsonResponse(426, 'Expected a WebSocket upgrade request on /ws.');
  }

  let upstream: WebSocket;
  try {
    upstream = await connectUpstream(resolveUpstreamUrl(request.url));
  } catch (error) {
    return jsonResponse(502, 'Realtime relay could not reach the API.', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    return await experimental_upgradeWebSocket((client) => bridge(client, upstream), {
      maxPayload: MAX_PAYLOAD_BYTES,
    });
  } catch (error) {
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
    // The browser will fall back to polling when the upgrade is unavailable.
    return jsonResponse(501, 'WebSocket upgrades are not available in this runtime.', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

// Vercel supports both web-handler shapes for non-Next frameworks; expose both so
// this works whether the runtime resolves method exports or a default fetch object.
export function GET(request: Request): Promise<Response> {
  return handleRequest(request);
}

export default { fetch: handleRequest };
