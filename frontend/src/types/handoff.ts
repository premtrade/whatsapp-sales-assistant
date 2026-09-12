import type { Conversation } from './conversation'

export interface Handoff {
  id: string
  conversation_id: string
  assigned_to: string | null
  requested_by: 'ai' | 'customer' | 'staff' | 'system'
  reason: string
  notes: string | null
  status: 'pending' | 'accepted' | 'completed' | 'cancelled'
  accepted_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  conversation?: Conversation
  contactName?: string
  contactPhone?: string
  assignedStaffName?: string
  assignedStaffEmail?: string
}

export interface HandoffUpdateRequest {
  assigned_to?: string
  status?: 'pending' | 'accepted' | 'completed' | 'cancelled'
  notes?: string
}

export interface HandoffListParams {
  page?: number
  limit?: number
  status?: string
  assigned_to?: string
  requested_by?: string
}
