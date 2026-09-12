export interface AuditLog {
  id: string
  entity_type: string
  entity_id: string | null
  action: string
  performed_by: string | null
  performed_by_type: 'system' | 'ai' | 'staff' | 'customer'
  description: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface AuditLogListParams {
  page?: number
  limit?: number
  entity_type?: string
  action?: string
  performed_by?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}
