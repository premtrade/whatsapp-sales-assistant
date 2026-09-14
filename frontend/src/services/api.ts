import axios from 'axios'
import type {
  LoginRequest,
  LoginResponse,
  StaffUser,
  PaginatedResponse,
  Contact,
  ContactCreateRequest,
  CustomerFact,
  Conversation,
  ConversationListParams,
  Message,
  MessageListParams,
  SendMessageRequest,
  Handoff,
  HandoffListParams,
  HandoffUpdateRequest,
  Quote,
  QuoteListParams,
  QuoteCreateRequest,
  QuoteItem,
  QuoteItemCreateRequest,
  Appointment,
  AppointmentListParams,
  AppointmentUpdateRequest,
  KnowledgeDocument,
  KnowledgeDocumentCreateRequest,
  KnowledgeChunk,
  AuditLog,
  AuditLogListParams,
  Setting,
  SettingsUpdateRequest,
  ApiError,
  LeadScore,
  LeadScoreListParams,
  LeadScoreCreateRequest,
  LeadPipelineSummary,
  FollowUp,
  ConversationNote,
  QuickReply,
  WhatsAppConfig,
  WhatsAppStatus,
  WhatsAppTestResult,
  SystemHealthResponse,
  SystemMetrics,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError: ApiError = {
      message: error.response?.data?.message || error.message || 'An unexpected error occurred',
      code: error.response?.data?.code,
      status: error.response?.status,
    }
    if (error.response?.status === 401) {
      // Token expired or invalid — clear local auth and force re-login.
      // NOTE: must match keys used in frontend/src/services/auth.ts
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_staff')
      localStorage.removeItem('staff_user')
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1')
      }
    }
    return Promise.reject(apiError)
  }
)

function getToken(): string | null {
  const token = localStorage.getItem('auth_token')
  if (token && token.startsWith('jwt:')) {
    return token.slice(4)
  }
  return token
}

// Helper to extract data from standard API response format
function extractData<T>(response: { data: { success: boolean; data: T; meta?: any } }): T {
  return response.data.data
}

function extractPaginatedData<T>(response: { data: { success: boolean; data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } } }): PaginatedResponse<T> {
  return {
    data: response.data.data,
    page: response.data.meta.page,
    limit: response.data.meta.limit,
    total: response.data.meta.total,
    totalPages: response.data.meta.totalPages,
  }
}

// Auth
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<{ data: { token: string; user: StaffUser } }>('/auth/login', data)
  return {
    token: response.data.data.token,
    staff: response.data.data.user,
  }
}

export async function getCurrentStaff(): Promise<StaffUser> {
  const response = await api.get<StaffUser>('/auth/me')
  return response.data
}

// Dashboard
export async function getDashboardStats(): Promise<{
  conversations: { total: number; active: number; waitingAgent: number; waitingCustomer: number; closed: number; archived: number }
  handoffs: { total: number; pending: number; accepted: number; completed: number; cancelled: number }
  quotes: { total: number; draft: number; sent: number; accepted: number; rejected: number; expired: number }
  appointments: { total: number; scheduled: number; confirmed: number; completed: number; cancelled: number; noShow: number }
  contacts: { total: number; active: number; blocked: number; archived: number }
  recentActivity: { conversationsLast24h: number; messagesLast24h: number; handoffsLast24h: number }
  pipeline: { totalQuotes: number; draft: number; sent: number; accepted: number; rejected: number; conversionRate: number; totalValue: number }
  trends: { conversationsByDay: { date: string; count: number }[]; messagesByDay: { date: string; count: number }[] }
  handoffsByReason: { reason: string; count: number }[]
}> {
  const response = await api.get('/stats/dashboard')
  return response.data.data || response.data
}

// Contacts
export async function getContacts(params?: { page?: number; limit?: number; search?: string; status?: string; source?: string }): Promise<PaginatedResponse<Contact>> {
  const response = await api.get<{ success: boolean; data: Contact[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/contacts', { params })
  return extractPaginatedData(response)
}

export async function getContact(id: string): Promise<Contact> {
  const response = await api.get<{ success: boolean; data: Contact }>(`/contacts/${id}`)
  return response.data.data
}

export async function createContact(data: ContactCreateRequest): Promise<Contact> {
  const response = await api.post<{ success: boolean; data: Contact }>('/contacts', data)
  return response.data.data
}

export async function updateContact(id: string, data: Partial<ContactCreateRequest>): Promise<Contact> {
  const response = await api.patch<{ success: boolean; data: Contact }>(`/contacts/${id}`, data)
  return response.data.data
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/contacts/${id}`)
}

// Conversations
export async function getConversations(params?: ConversationListParams): Promise<PaginatedResponse<Conversation>> {
  const response = await api.get<{ success: boolean; data: Conversation[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/conversations', { params })
  return extractPaginatedData(response)
}

export async function getConversation(id: string): Promise<Conversation> {
  const response = await api.get<{ success: boolean; data: Conversation }>(`/conversations/${id}`)
  return response.data.data
}

export async function getConversationMessages(conversationId: string, params?: MessageListParams): Promise<PaginatedResponse<Message>> {
  const response = await api.get<{ success: boolean; data: Message[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(`/messages/${conversationId}`, { params })
  return extractPaginatedData(response)
}

export async function sendMessage(conversationId: string, data: SendMessageRequest): Promise<Message> {
  const response = await api.post<{ success: boolean; data: Message }>(`/messages/${conversationId}/reply`, data)
  return response.data.data
}

export async function updateConversationStatus(conversationId: string, status: string): Promise<Conversation> {
  const response = await api.patch<{ success: boolean; data: Conversation }>(`/conversations/${conversationId}/status`, { status })
  return response.data.data
}

// Handoffs
export async function getHandoffs(params?: HandoffListParams): Promise<PaginatedResponse<Handoff>> {
  const response = await api.get<{ success: boolean; data: Handoff[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/handoffs', { params })
  return extractPaginatedData(response)
}

export async function getPendingHandoffs(): Promise<Handoff[]> {
  const response = await api.get<{ success: boolean; data: Handoff[] }>('/handoffs/pending')
  return response.data.data || []
}

export async function updateHandoff(id: string, data: HandoffUpdateRequest): Promise<Handoff> {
  const response = await api.patch<{ success: boolean; data: Handoff }>(`/handoffs/${id}/status`, data)
  return response.data.data
}

export async function assignHandoff(id: string, staffId: string): Promise<Handoff> {
  const response = await api.patch<{ success: boolean; data: Handoff }>(`/handoffs/${id}/assign`, { assigned_to: staffId })
  return response.data.data
}

// Quotes
export async function getQuotes(params?: QuoteListParams): Promise<PaginatedResponse<Quote>> {
  const response = await api.get<{ success: boolean; data: Quote[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/quotes', { params })
  return extractPaginatedData(response)
}

export async function getQuote(id: string): Promise<Quote> {
  const response = await api.get<{ success: boolean; data: Quote }>(`/quotes/${id}`)
  return response.data.data
}

export async function createQuote(data: QuoteCreateRequest): Promise<Quote> {
  const response = await api.post<{ success: boolean; data: Quote }>('/quotes', data)
  return response.data.data
}

export async function updateQuote(id: string, data: Partial<QuoteCreateRequest>): Promise<Quote> {
  const response = await api.patch<{ success: boolean; data: Quote }>(`/quotes/${id}`, data)
  return response.data.data
}

export async function deleteQuote(id: string): Promise<void> {
  await api.delete(`/quotes/${id}`)
}

export async function getQuoteItems(quoteId: string): Promise<QuoteItem[]> {
  const response = await api.get<{ success: boolean; data: QuoteItem[] }>(`/quotes/${quoteId}/items`)
  return response.data.data
}

export async function createQuoteItem(quoteId: string, data: QuoteItemCreateRequest): Promise<QuoteItem> {
  const response = await api.post<{ success: boolean; data: QuoteItem }>(`/quotes/${quoteId}/items`, data)
  return response.data.data
}

export async function updateQuoteItem(quoteId: string, itemId: string, data: Partial<QuoteItemCreateRequest>): Promise<QuoteItem> {
  const response = await api.patch<{ success: boolean; data: QuoteItem }>(`/quotes/${quoteId}/items/${itemId}`, data)
  return response.data.data
}

export async function deleteQuoteItem(quoteId: string, itemId: string): Promise<void> {
  await api.delete(`/quotes/${quoteId}/items/${itemId}`)
}

// Appointments
export async function getAppointments(params?: AppointmentListParams): Promise<PaginatedResponse<Appointment>> {
  const response = await api.get<{ success: boolean; data: Appointment[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/appointments', { params })
  return extractPaginatedData(response)
}

export async function updateAppointment(id: string, data: AppointmentUpdateRequest): Promise<Appointment> {
  const response = await api.patch<{ success: boolean; data: Appointment }>(`/appointments/${id}`, data)
  return response.data.data
}

// Knowledge
export async function getKnowledgeDocuments(params?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<KnowledgeDocument>> {
  const response = await api.get<{ success: boolean; data: KnowledgeDocument[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/knowledge/documents', { params })
  return extractPaginatedData(response)
}

export async function getKnowledgeDocument(id: string): Promise<KnowledgeDocument> {
  const response = await api.get<{ success: boolean; data: KnowledgeDocument }>(`/knowledge/documents/${id}`)
  return response.data.data
}

export async function createKnowledgeDocument(data: KnowledgeDocumentCreateRequest): Promise<KnowledgeDocument> {
  const response = await api.post<{ success: boolean; data: KnowledgeDocument }>('/knowledge/documents', data)
  return response.data.data
}

export async function getKnowledgeChunks(documentId: string): Promise<KnowledgeChunk[]> {
  const response = await api.get<{ success: boolean; data: KnowledgeChunk[] }>(`/knowledge/documents/${documentId}/chunks`)
  return response.data.data
}

// Customer Facts
export async function getCustomerFacts(contactId: string): Promise<CustomerFact[]> {
  const response = await api.get<{ success: boolean; data: CustomerFact[] }>(`/contacts/${contactId}/facts`)
  return response.data.data
}

// Audit Logs
export async function getAuditLogs(params?: AuditLogListParams): Promise<PaginatedResponse<AuditLog>> {
  const response = await api.get<{ success: boolean; data: AuditLog[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/audit-logs', { params })
  return extractPaginatedData(response)
}

// Settings
export async function getSettings(): Promise<Setting[]> {
  const response = await api.get<{ success: boolean; data: Setting[] }>('/settings')
  return response.data.data
}

export async function updateSetting(data: SettingsUpdateRequest): Promise<Setting> {
  const response = await api.put<{ success: boolean; data: Setting }>('/settings', data)
  return response.data.data
}

export async function createSetting(data: { setting_key: string; setting_value?: string | null; data_type?: string; description?: string | null }): Promise<Setting> {
  const response = await api.post<{ success: boolean; data: Setting }>('/settings', data)
  return response.data.data
}


export async function getStaffUsers(params?: { page?: number; limit?: number; role?: string; status?: string; search?: string }): Promise<{ data: StaffUser[]; meta: PaginatedResponse<StaffUser> }> {
  const response = await api.get<{ success: boolean; data: StaffUser[]; meta: any }>('/staff/users', { params })
  return { data: response.data.data || [], meta: response.data.meta }
}

export async function getStaffUser(id: string): Promise<StaffUser> {
  const response = await api.get<{ success: boolean; data: StaffUser }>('/staff/users/' + id)
  return response.data.data
}

// Lead Scores
export async function getLeadScores(params?: LeadScoreListParams): Promise<PaginatedResponse<LeadScore>> {
  const response = await api.get<{ success: boolean; data: LeadScore[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/lead-scores', { params })
  return extractPaginatedData(response)
}

export async function getLeadScore(id: string): Promise<LeadScore> {
  const response = await api.get<{ success: boolean; data: LeadScore }>(`/lead-scores/${id}`)
  return response.data.data
}

export async function createLeadScore(data: LeadScoreCreateRequest): Promise<LeadScore> {
  const response = await api.post<{ success: boolean; data: LeadScore }>('/lead-scores', data)
  return response.data.data
}

export async function updateLeadScore(id: string, data: { status: string }): Promise<LeadScore> {
  const response = await api.patch<{ success: boolean; data: LeadScore }>(`/lead-scores/${id}`, data)
  return response.data.data
}

export async function getLeadPipeline(): Promise<LeadPipelineSummary> {
  const response = await api.get<{ success: boolean; data: LeadPipelineSummary }>('/lead-scores/pipeline')
  return response.data.data
}

export async function getFollowUps(params?: { conversationId?: string }): Promise<FollowUp[]> {
  const response = await api.get<{ success: boolean; data: FollowUp[] }>('/follow-ups/due', { params })
  return response.data.data
}

// Conversation Notes
export async function getConversationNotes(conversationId: string): Promise<ConversationNote[]> {
  const response = await api.get<{ success: boolean; data: ConversationNote[] }>(`/conversations/${conversationId}/notes`)
  return response.data.data
}

export async function createConversationNote(conversationId: string, note: string, isInternal = true): Promise<ConversationNote> {
  const response = await api.post<{ success: boolean; data: ConversationNote }>(`/conversations/${conversationId}/notes`, { note, isInternal })
  return response.data.data
}

export async function deleteConversationNote(conversationId: string, noteId: string): Promise<void> {
  await api.delete(`/conversations/${conversationId}/notes/${noteId}`)
}

// Quick Replies
export async function getQuickReplies(params?: { category?: string }): Promise<QuickReply[]> {
  const response = await api.get<{ success: boolean; data: QuickReply[] }>('/quick-replies', { params })
  return response.data.data
}

export async function createQuickReply(data: { title: string; text: string; category?: string }): Promise<QuickReply> {
  const response = await api.post<{ success: boolean; data: QuickReply }>('/quick-replies', data)
  return response.data.data
}

// WhatsApp Config
export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const response = await api.get<{ success: boolean; data: WhatsAppConfig }>('/whatsapp/config')
  return response.data.data
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const response = await api.get<{ success: boolean; data: WhatsAppStatus }>('/whatsapp/status')
  return response.data.data
}

export async function testWhatsAppConnection(): Promise<WhatsAppTestResult> {
  const response = await api.post<{ success: boolean; data: WhatsAppTestResult }>('/whatsapp/test-connection')
  return response.data.data
}

// System Health
export async function getSystemHealth(): Promise<SystemHealthResponse> {
  const response = await api.get<{ success: boolean; data: SystemHealthResponse }>('/system/health')
  return response.data.data
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const response = await api.get<{ success: boolean; data: SystemMetrics }>('/system/metrics')
  return response.data.data
}

export default api
