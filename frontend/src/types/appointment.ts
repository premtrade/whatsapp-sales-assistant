import type { Contact } from './contact'

export interface Appointment {
  id: string
  contact_id: string
  conversation_id: string | null
  quote_id: string | null
  appointment_type: 'consultation' | 'site_visit' | 'installation' | 'follow_up' | 'delivery' | 'other'
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string
  assigned_to: string | null
  reminder_sent: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  contact?: Contact
}

export interface AppointmentListParams {
  page?: number
  limit?: number
  status?: string
  appointment_type?: string
  contactId?: string
  assignedTo?: string
  dateFrom?: string
  dateTo?: string
}

export interface AppointmentUpdateRequest {
  status?: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  title?: string
  description?: string
  location?: string
  starts_at?: string
  ends_at?: string
  assigned_to?: string
}
