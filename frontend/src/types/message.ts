export interface Message {
  id: string
  conversation_id: string
  whatsapp_message_id: string | null
  direction: 'incoming' | 'outgoing'
  sender_type: 'customer' | 'ai' | 'staff' | 'system'
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact' | 'sticker' | 'reaction'
  text_body: string | null
  media_url: string | null
  mime_type: string | null
  media_size: number | null
  caption: string | null
  metadata: Record<string, unknown>
  delivered_at: string | null
  read_at: string | null
  created_at: string
  updated_at: string
}

export interface SendMessageRequest {
  text_body: string
  message_type?: string
}

export interface MessageListParams {
  page?: number
  limit?: number
  direction?: string
  sender_type?: string
  dateFrom?: string
  dateTo?: string
}
