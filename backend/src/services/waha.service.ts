import fs from 'fs';
import { config } from '../config';
import logger from '../utils/logger';

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

/**
 * A WhatsApp chat JID. WAHA/WEBJS increasingly reports senders as
 * `<lid>@lid` (Linked ID, a privacy-preserving identifier) instead of
 * `<phone>@c.us`. Replies must go to whichever JID WAHA reported —
 * sending to `<lid>@c.us` will fail / go nowhere.
 */
export type WahaChatId = string;

export interface ContactRow {
  phone: string;
  wa_lid?: string | null;
  wa_chat_id?: string | null;
}

/**
 * Resolve the correct WAHA chatId for an outgoing message.
 *
 * Priority:
 *  1. Stored wa_chat_id (the exact JID WAHA reported: ...@lid or ...@c.us)
 *  2. A value that already contains '@' (assumed to be a full JID)
 *  3. `<digits>@c.us` fallback for legacy plain-phone rows
 */
export function resolveWahaChatId(contact: Pick<ContactRow, 'phone' | 'wa_lid' | 'wa_chat_id'>): string {
  const stored = (contact.wa_chat_id || '').trim();
  if (stored.includes('@')) return stored;
  const phone = (contact.phone || '').trim();
  if (phone.includes('@')) return phone;
  const lid = (contact.wa_lid || '').replace(/\D/g, '');
  if (lid && (!phone || phone === lid)) return `${lid}@lid`;
  const digits = phone.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : phone;
}

/**
 * Resolve a WhatsApp LID to its real phone number via WAHA:
 * GET /api/{session}/lids/{lid} -> { lid, pn }
 * Returns the phone digits (no suffix) or null when unknown.
 */
export async function resolvePhoneByLid(session: string, lid: string): Promise<string | null> {
  try {
    const lidDigits = lid.replace(/\D/g, '');
    if (!lidDigits) return null;
    const res = await fetch(
      `${wahaBaseUrl()}/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(lidDigits)}`,
      { headers: wahaHeaders(), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { pn?: string | null };
    const pn = (data?.pn || '').replace(/\D/g, '');
    return pn || null;
  } catch (err) {
    logger.warn('WAHA LID lookup failed', { session, lid, error: err instanceof Error ? err.message : 'Unknown error' });
    return null;
  }
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

/**
 * Fetches the pairing QR code for a session.
 *
 * WAHA does not expose the QR on the session object — it is served by
 * `GET /api/{session}/auth/qr`. We request the JSON media type
 * (`{"mimetype":"image/png","data":"<base64>"}`) and return a data URI so the
 * dashboard can drop it straight into an <img src>. Falls back to the binary
 * image response.
 */
export async function getWahaQrCode(session: string): Promise<string | null> {
  try {
    const res = await fetch(`${wahaBaseUrl()}/api/${encodeURIComponent(session)}/auth/qr`, {
      headers: wahaHeaders({ Accept: 'application/json' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { mimetype?: string; data?: string };
      if (data?.data) return `data:${data.mimetype || 'image/png'};base64,${data.data}`;
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return null;
    return `data:${contentType.split(';')[0] || 'image/png'};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
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
