import fs from 'fs';
import { config } from '../config';

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
