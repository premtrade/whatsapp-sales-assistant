import fs from 'fs';
import { config } from '../config';

function wahaBaseUrl(): string {
  return `http://${config.waha.host}:${config.waha.port}`;
}

function wahaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Api-Key': config.waha.apiKey, ...extra };
}

export interface WahaSessionInfo {
  status: string;
  qr?: string;
}

export async function getWahaSessionInfo(session: string): Promise<WahaSessionInfo | null> {
  const res = await fetch(`${wahaBaseUrl()}/api/sessions/${encodeURIComponent(session)}`, {
    headers: wahaHeaders(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as WahaSessionInfo;
  return { status: data.status, qr: data.qr };
}

/**
 * Creates and starts a WAHA session if it does not already exist.
 * Idempotent: an existing session is left untouched.
 */
export async function ensureWahaSession(session: string): Promise<WahaSessionInfo | null> {
  const existing = await getWahaSessionInfo(session);
  if (existing) return existing;

  const res = await fetch(`${wahaBaseUrl()}/api/sessions/start`, {
    method: 'POST',
    headers: wahaHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: session }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create WAHA session '${session}': ${res.status}`);
  }

  // Session was just created — fetch its status (should be SCAN_ME/QR)
  return getWahaSessionInfo(session);
}

export async function sendWahaDocument(params: {
  session: string;
  chatId: string;
  filePath: string;
  filename: string;
  caption: string;
}) {
  const FormData = (await import('form-data')).default;
  const formData = new FormData();
  formData.append('session', params.session);
  formData.append('chatId', params.chatId);
  formData.append('file', fs.createReadStream(params.filePath), {
    filename: params.filename,
    contentType: 'application/pdf',
  });
  formData.append('caption', params.caption);

  const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
  const res = await fetch(`${baseUrl}/api/sendFile`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.waha.apiKey,
      ...formData.getHeaders(),
    },
    body: formData as unknown as Buffer,
  });

  if (!res.ok) throw new Error(`WAHA send failed: ${res.status}`);
  return res.json();
}

export async function sendWahaText(params: {
  session: string;
  chatId: string;
  text: string;
}) {
  const baseUrl = `http://${config.waha.host}:${config.waha.port}`;
  const res = await fetch(`${baseUrl}/api/sendText`, {
    method: 'POST',
    headers: {
      'X-Api-Key': config.waha.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: params.session,
      chatId: params.chatId,
      text: params.text,
    }),
  });

  if (!res.ok) throw new Error(`WAHA send text failed: ${res.status}`);
  return res.json();
}
