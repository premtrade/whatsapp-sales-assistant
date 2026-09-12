import type { Contact } from './contact'

export interface Quote {
  id: string
  quote_number: string
  contact_id: string
  conversation_id: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
  subtotal: number
  tax: number
  discount: number
  total: number
  currency: string
  notes: string | null
  valid_until: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
  requires_review?: boolean
  contact?: Contact
}

export interface QuoteItem {
  id: string
  quote_id: string
  product_id: string
  line_number: number
  description: string | null
  quantity: number
  unit: string
  unit_price: number
  tax_rate: number
  discount: number
  line_total: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface QuoteListParams {
  page?: number
  limit?: number
  status?: string
  contactId?: string
  conversationId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}

export interface QuoteCreateRequest {
  contact_id: string
  conversation_id?: string
  currency?: string
  notes?: string
  valid_until?: string
}

export interface QuoteItemCreateRequest {
  product_id: string
  description?: string
  quantity?: number
  unit?: string
  unit_price?: number
  tax_rate?: number
  discount?: number
}
