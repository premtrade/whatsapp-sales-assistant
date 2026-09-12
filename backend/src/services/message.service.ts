import { query } from '../utils/database';
import { NotFoundError } from '../utils/errors';
import { config } from '../config';
import logger from '../utils/logger';
import { Message } from '../types';
import { emitNewMessage, emitDashboardStatsUpdated } from '../websocketServer';

interface ConversationRow {
  contact_id: string;
}

interface ContactRow {
  phone: string;
}

export async function getMessages(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
  const result = await query<Message>(
    `SELECT id, conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body, media_url, mime_type, media_size, caption, metadata, delivered_at, read_at, created_at, updated_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  return result.rows;
}

export async function sendMessage(
  conversationId: string,
  textBody: string,
  staffId: string,
  metadata: Record<string, unknown> = {}
): Promise<Message> {
  const conversationResult = await query<ConversationRow>(
    'SELECT contact_id FROM conversations WHERE id = $1',
    [conversationId]
  );

  const conversation = conversationResult.rows[0];

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const contactResult = await query<ContactRow>(
    'SELECT phone FROM contacts WHERE id = $1',
    [conversation.contact_id]
  );

  const contact = contactResult.rows[0];

  if (!contact) {
    throw new NotFoundError('Contact not found');
  }

  const messageResult = await query<Message>(
    `INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body, metadata, created_at, updated_at)
     VALUES ($1, 'outgoing', 'staff', 'text', $2, $3, NOW(), NOW())
     RETURNING id, conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body, media_url, mime_type, media_size, caption, metadata, delivered_at, read_at, created_at, updated_at`,
    [conversationId, textBody, { ...metadata, staffId }]
  );

  const message = messageResult.rows[0];

  if (!message) {
    throw new NotFoundError('Failed to create message');
  }

  await query(
    `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );

  logger.info('Message sent by staff', { conversationId, messageId: message.id, staffId });

  await triggerWahaWebhook(conversationId, contact.phone, textBody, metadata);

  // Emit real-time events
  await emitNewMessage(conversationId, message);
  await emitDashboardStatsUpdated();

  return message;
}

async function triggerWahaWebhook(
  conversationId: string,
  phone: string,
  textBody: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const wahaUrl = `http://${config.waha.host}:${config.waha.port}/api/sessions/${config.waha.session || 'default'}/messages`;

    await fetch(wahaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.waha.apiKey,
      },
      body: JSON.stringify({
        chatId: phone,
        text: textBody,
        metadata: {
          ...metadata,
          conversationId,
        },
      }),
    });

    logger.info('WAHA webhook triggered', { conversationId, phone });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to trigger WAHA webhook', { conversationId, error: errorMessage });
  }
}
