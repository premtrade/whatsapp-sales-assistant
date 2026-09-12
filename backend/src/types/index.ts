import { WebSocket } from 'ws';
import { Request } from 'express';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
  employeeNumber?: string;
  firstName: string;
  lastName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
}

export interface ConversationFilters extends PaginationQuery, DateRangeQuery {
  status?: string;
  priority?: string;
  contactId?: string;
  assignedTo?: string;
  channel?: string;
  search?: string;
}

export interface ContactFilters extends PaginationQuery {
  search?: string;
  status?: string;
  source?: string;
  tags?: string[];
}

export interface HandoffFilters extends PaginationQuery {
  status?: string;
  conversationId?: string;
  assignedTo?: string;
  requestedBy?: string;
}

export interface QuoteFilters extends PaginationQuery {
  status?: string;
  contactId?: string;
  conversationId?: string;
  search?: string;
}

export interface AppointmentFilters extends PaginationQuery {
  status?: string;
  contactId?: string;
  assignedTo?: string;
  startDate?: string;
  endDate?: string;
}

export interface KnowledgeFilters extends PaginationQuery {
  status?: string;
  documentType?: string;
  language?: string;
  search?: string;
}

export interface AuditLogFilters extends PaginationQuery, DateRangeQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  performedBy?: string;
  performedByType?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface WSClient {
  ws: WebSocket;
  userId?: string;
  role?: string;
}

// Database entity types
export interface Contact {
  id: string;
  phone: string;
  display_name?: string;
  email?: string;
  company?: string;
  source: string;
  preferred_language: string;
  opt_in: boolean;
  tags: unknown[];
  notes?: string;
  status: string;
  first_seen_at: Date;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: string;
  contact_id: string;
  channel: string;
  status: string;
  assigned_to?: string;
  started_at: Date;
  last_message_at: Date;
  ended_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  whatsapp_message_id?: string;
  direction: string;
  sender_type: string;
  message_type: string;
  text_body?: string;
  media_url?: string;
  mime_type?: string;
  media_size?: number;
  caption?: string;
  metadata: Record<string, unknown>;
  delivered_at?: Date;
  read_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface StaffUser {
  id: string;
  employee_number?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  timezone: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  business_id?: string;
}

export interface Handoff {
  id: string;
  conversation_id: string;
  assigned_to?: string;
  requested_by: string;
  reason: string;
  notes?: string;
  status: string;
  accepted_at?: Date;
  completed_at?: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Quote {
  id: string;
  quote_number: string;
  contact_id: string;
  conversation_id?: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  notes?: string;
  valid_until?: Date;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
  pdf_url?: string;
  sent_at?: Date;
  sent_via?: string;
}

export interface Appointment {
  id: string;
  contact_id: string;
  conversation_id?: string;
  quote_id?: string;
  appointment_type: string;
  status: string;
  title: string;
  description?: string;
  location?: string;
  starts_at: Date;
  ends_at: Date;
  assigned_to?: string;
  reminder_sent: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  document_type: string;
  source?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  checksum?: string;
  language: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  chunk_number: number;
  chunk_text: string;
  token_count?: number;
  embedding_model?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  similarity?: number;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  performed_by?: string;
  performed_by_type: string;
  description?: string;
  old_values?: unknown;
  new_values?: unknown;
  metadata: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface CustomerFact {
  id: string;
  contact_id: string;
  fact_key: string;
  fact_value: string;
  confidence: number;
  source: string;
  created_at: Date;
  updated_at: Date;
}
