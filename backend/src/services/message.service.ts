import { query, transaction } from '../utils/database';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import logger from '../utils/logger';
import { Message } from '../types';
import { emitNewMessage, emitDashboardStatsUpdated } from '../websocketServer';
import { assertAiQuotaAvailable, recordAiResponse } from './entitlement.service';

interface ConversationRow {
  contact_id: string;
  business_id: string | null;
}

interface ContactRow {
  phone: string;
}

/**
 * Resolve + verify the conversation belongs to the caller's tenant.
 * Tenant isolation close-the-loop: without businessId we deny rather than
 * fall back to a global scope (legacy tokens are rejected upstream by
 * requireEntitlement, this guards direct service callers too).
 */
async function requireTenantConversation(
  conversationId: string,
  businessId?: string | null
): Promise<ConversationRow> {
  const result = await query<ConversationRow>(
    'SELECT contact_id, business_id FROM conversations WHERE id = $1',
    [conversationId]
  );
  const conversation = result.rows[0];
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }
  if (!businessId || conversation.business_id !== businessId) {
    throw new ForbiddenError(
      'Conversation does not belong to your workspace',
      'TENANT_MISMATCH'
    );
  }
  return conversation;
}

export async function getMessages(
  conversationId: string,
  limit = 50,
  offset = 0,
  businessId?: string | null
): Promise<Message[]> {
  // Verify tenant ownership before returning any message rows.
  await requireTenantConversation(conversationId, businessId);

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
  metadata: Record<string, unknown> = {},
  options: { businessId?: string | null; senderType?: 'staff' | 'ai' } = {}
): Promise<Message> {
  const businessId = options.businessId ?? null;
  const senderType = options.senderType ?? 'staff';

  const conversation = await requireTenantConversation(conversationId, businessId);

  // AI-generated sends pass through the entitlement gate BEFORE persisting:
  // trial expiry / suspension -> 403, kill-switch -> 403, quota -> 402.
  if (senderType === 'ai') {
    await assertAiQuotaAvailable(businessId as string);
  }

  const contactResult = await query<ContactRow>(
    'SELECT phone FROM contacts WHERE id = $1 AND business_id = $2',
    [conversation.contact_id, businessId]
  );

  const contact = contactResult.rows[0];

  if (!contact) {
    throw new NotFoundError('Contact not found');
  }

  const message = await transaction(async (client) => {
    const res = await client.query<Message>(
      `INSERT INTO messages (conversation_id, direction, sender_type, message_type, text_body, metadata, created_at, updated_at)
       VALUES ($1, 'outgoing', $2, 'text', $3, $4, NOW(), NOW())
       RETURNING id, conversation_id, whatsapp_message_id, direction, sender_type, message_type, text_body, media_url, mime_type, media_size, caption, metadata, delivered_at, read_at, created_at, updated_at`,
      [conversationId, senderType, textBody, { ...metadata, staffId }]
    );
    const msg = res.rows[0];
    if (!msg) {
      throw new NotFoundError('Failed to create message');
    }

    await client.query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    // Metered exactly once, inside the same transaction as the row insert —
    // deduped by the persisted message id so retries can't double-count.
    if (senderType === 'ai') {
      await recordAiResponse(businessId as string, msg.id);
    }

    return msg;
  });

  logger.info('Message sent', { conversationId, messageId: message.id, staffId, senderType });

  await triggerWahaWebhook(conversationId, contact.phone, textBody, metadata, businessId);

  // Emit real-time events
  await emitNewMessage(conversationId, message);
  await emitDashboardStatsUpdated();

  return message;
}

async function triggerWahaWebhook(
  conversationId: string,
  phone: string,
  textBody: string,
  metadata: Record<string, unknown>,
  businessId?: string | null
): Promise<void> {
  try {
    // Per-tenant WAHA session (businesses.waha_session_name) so beta tenants
    // never share the legacy 'default' session.
    let session = config.waha.session || 'default';
    if (businessId) {
      const result = await query<{ waha_session_name: string | null }>(
        'SELECT waha_session_name FROM businesses WHERE id = $1',
        [businessId]
      );
      session = result.rows[0]?.waha_session_name || session;
    }

    const wahaUrl = `http://${config.waha.host}:${config.waha.port}/api/sessions/${session}/messages`;

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
