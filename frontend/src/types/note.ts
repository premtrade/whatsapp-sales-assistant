export interface ConversationNote {
  id: string
  conversation_id: string
  staff_id: string
  note: string
  is_internal: boolean
  created_at: string
  updated_at: string
}

export interface QuickReply {
  id: string
  title: string
  text: string
  category?: string
  created_by: string
  created_at: string
  updated_at: string
}
