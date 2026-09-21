import { query } from '../utils/database';
import { NotFoundError } from '../utils/errors';
import { config } from '../config';
import logger from '../utils/logger';
import { Message } from '../types';
import { emitNewMessage, emitDashboardStatsUpdated } from '../websocketServer';
import { sendWahaText } from './waha.service';
import { getBusinessById } from './business.service';

interface ConversationRow {
  contact_id: string;
  business_id: string;
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
    'SELECT contact_id, business_id FROM conversations WHERE id = $1',
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

  await triggerWahaWebhook(conversationId, contact.phone, textBody, metadata, conversation.business_id);

  // Emit real-time events with tenantId
  const tenantId = conversation.business_id;
  await emitNewMessage(tenantId, conversationId, message);
  await emitDashboardStatsUpdated(undefined, tenantId);

  return message;
}

async function triggerWahaWebhook(
  conversationId: string,
  phone: string,
  textBody: string,
  metadata: Record<string, unknown>,
  businessId: string
): Promise<void> {
  try {
    // Resolve the tenant's own WhatsApp session so replies always come from
    // the correct business number (never the global/default session).
    let session = config.waha.session || 'default';
    try {
      const business = await getBusinessById(businessId);
      session = business.waha_session_name || session;
    } catch (err) {
      logger.warn('Falling back to default WAHA session', { conversationId, businessId, error: err });
    }

    // WAHA chatIds are JIDs: normalize bare phones to <phone>@c.us
    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

    await sendWahaText({ session, chatId, text: textBody });

    logger.info('WAHA message sent', { conversationId, phone, session });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to trigger WAHA webhook', { conversationId, error: errorMessage });
  }
}