import type { Contact } from './contact'
import type { Message } from './message'

export interface Conversation {
  id: string
  contact_id: string
  channel: 'whatsapp' | 'telegram' | 'messenger' | 'webchat' | 'sms'
  status: 'active' | 'waiting_customer' | 'waiting_agent' | 'closed' | 'archived'
  assigned_to: string | null
  contact?: Contact
  messages?: Message[]
  active_handoff?: {
    id: string
    reason: string
    assigned_to: string | null
    status: 'pending' | 'accepted' | 'completed' | 'cancelled'
  } | null
  leadScore?: {
    total_score: number
    status: string
    project_type: string
    estimated_budget: string
  }
  customer_facts?: Array<{
    fact_key: string
    fact_value: string
    confidence: number
  }>
  upcoming_appointments?: Array<{
    id: string
    appointment_type: string
    status: string
    title: string
    starts_at: string
    ends_at: string
  }>
  recent_quotes?: Array<{
    id: string
    quote_number: string
    status: string
    subtotal: number
    tax: number
    discount: number
    total: number
    currency: string
    valid_until: string | null
  }>
  lastMessage?: {
    id: string
    conversation_id: string
    direction: string
    sender_type: string
    message_type: string
    text_body?: string
    created_at: string
  }
  started_at: string
  last_message_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface ConversationListParams {
  page?: number
  limit?: number
  status?: string
  channel?: string
  contactId?: string
  assignedTo?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  sortField?: string
  sortDirection?: 'asc' | 'desc'
}
