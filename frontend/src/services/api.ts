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
  KnowledgeDocumentUpdateRequest,
  KnowledgeChunk,
  AuditLog,
  AuditLogListParams,
  Setting,
  SettingsUpdateRequest,
  MessageTemplate,
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
  Plan,
  OwnerDashboardStats,
  FinancialMetrics,
  ConversionMetrics,
  CrmSettings,
  CrmSettingsUpdateRequest,
} from '../types'

const rawApiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

const TENANT_STORAGE_KEY = 'waflo_selected_tenant_id'

/**
 * Tenant selected by a platform owner (super_admin).
 *
 * A tenant user is always scoped to the tenant in their token. The platform
 * owner has no tenant of their own, so the dashboard lets them pick one and
 * every request then carries it in X-Tenant-Id. That keeps knowledge uploads,
 * listings and diagnostics on the tenant that was actually selected instead
 * of falling back to the first business.
 */
export function getSelectedTenantId(): string | null {
  try {
    return window.localStorage.getItem(TENANT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSelectedTenantId(tenantId: string | null): void {
  try {
    if (tenantId) {
      window.localStorage.setItem(TENANT_STORAGE_KEY, tenantId)
    } else {
      window.localStorage.removeItem(TENANT_STORAGE_KEY)
    }
  } catch {
    // storage unavailable - the selection just does not persist
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const tenantId = getSelectedTenantId()
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError: ApiError = {
      // Backend responses vary by route: `{ message }` for most, but the
      // admin/owner routes return `{ error }`. Read both so callers show the
      // real reason instead of a bare axios "Request failed with status code".
      message:
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'An unexpected error occurred',
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

function extractPaginatedData<T>(response: { data: { success: boolean; data: T[]; meta?: { page?: number; limit?: number; total?: number; totalPages?: number } | null } }): PaginatedResponse<T> {
  // Defensive extraction: some deployments (proxies, older backend builds, or
  // error payloads returned with HTTP 200) omit `meta`, which previously blew
  // up with "Cannot read properties of undefined (reading 'page')". Derive
  // sane defaults instead of crashing the page.
  const body = response.data
  const rows = Array.isArray(body?.data) ? body.data : []
  const meta = body?.meta ?? {}
  const limit = typeof meta.limit === 'number' && meta.limit > 0 ? meta.limit : rows.length || 20
  const total = typeof meta.total === 'number' ? meta.total : rows.length
  return {
    data: rows,
    page: typeof meta.page === 'number' ? meta.page : 1,
    limit,
    total,
    totalPages: typeof meta.totalPages === 'number' ? meta.totalPages : Math.max(1, Math.ceil(total / limit)),
  }
}

// Auth
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<{ success: boolean; data: { token: string; user: StaffUser } }>('/auth/login', data)
  return {
    token: response.data.data.token,
    staff: response.data.data.user,
  }
}

export async function getCurrentStaff(): Promise<StaffUser> {
  // Backend wraps the row as { success: true, data: <staff row> }; the old
  // code returned the whole envelope, so callers saw `undefined` fields and
  // treated a valid session as logged-out.
  const response = await api.get<{ success: boolean; data: StaffUser }>('/auth/me')
  return response.data.data
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

export async function getOnboardingStatus(): Promise<{ whatsappConnected: boolean; hasKnowledge: boolean; hasSentMessage: boolean }> {
  const response = await api.get<{ success: boolean; data: { whatsappConnected: boolean; hasKnowledge: boolean; hasSentMessage: boolean } }>('/stats/onboarding')
  return response.data.data
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
export async function getKnowledgeDocuments(params?: { page?: number; limit?: number; status?: string; search?: string }): Promise<PaginatedResponse<KnowledgeDocument>> {
  // Drop empty values so the backend doesn't filter by a blank search/status.
  const cleanParams = Object.fromEntries(
    Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  // NOTE: no trailing slash. The Vercel rewrite (/api/:path*) does not match
  // trailing-slash URLs, so '/knowledge/' would fall through to the SPA
  // fallback and return index.html instead of JSON (axios then silently
  // parses it as text -> an empty list with no error).
  const response = await api.get<{ success: boolean; data: KnowledgeDocument[]; meta: { page: number; limit: number; total: number; totalPages: number } }>('/knowledge', { params: cleanParams })
  return extractPaginatedData(response)
}

export async function getKnowledgeDocument(id: string): Promise<KnowledgeDocument> {
  const response = await api.get<{ success: boolean; data: KnowledgeDocument }>(`/knowledge/${id}`)
  return response.data.data
}

export async function createKnowledgeDocument(data: KnowledgeDocumentCreateRequest): Promise<{ document: KnowledgeDocument; chunksCreated?: number; message?: string }> {
  // Backend returns `{ document, chunksCreated, message }` for text documents
  // (chunked + embedded synchronously) and the bare document otherwise.
  const response = await api.post<{ success: boolean; data: KnowledgeDocument | { document: KnowledgeDocument; chunksCreated: number }; message?: string }>('/knowledge', data)
  const payload = response.data.data
  if (payload && typeof payload === 'object' && 'document' in payload) {
    return { document: payload.document, chunksCreated: payload.chunksCreated, message: response.data.message }
  }
  return { document: payload as KnowledgeDocument }
}

export async function updateKnowledgeDocument(id: string, data: KnowledgeDocumentUpdateRequest): Promise<KnowledgeDocument> {
  const response = await api.patch<{ success: boolean; data: KnowledgeDocument }>(`/knowledge/${id}`, data)
  return response.data.data
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  await api.delete<{ success: boolean; message: string }>(`/knowledge/${id}`)
}

export async function uploadKnowledgeDocument(formData: FormData): Promise<{ document: KnowledgeDocument; chunksCreated: number; message: string }> {
  // Uploads are multipart/form-data: use the shared axios instance (base URL +
  // Bearer token interceptor) and let the browser set the boundary.
  //
  // CRITICAL: the instance sets a default 'Content-Type: application/json'.
  // Axios >= 1.20 *serializes FormData to a JSON string* whenever the request
  // content type is JSON (see transformRequest: `hasJSONContentType ?
  // JSON.stringify(formDataToJSON(data)) : data`), which turns the file into
  // `{"file":{}}` — multer then never sees a file and the API replies
  // 400 "File is required". Clearing the header for this one request makes
  // axios pass the FormData through so the browser attaches the multipart
  // boundary. (Verified locally against the project's axios 1.20.0.)
  const response = await api.post<{ success: boolean; data: { document: KnowledgeDocument; chunksCreated: number }; message: string }>(
    '/knowledge/upload',
    formData,
    { headers: { 'Content-Type': undefined } }
  );
  return {
    document: response.data.data.document,
    chunksCreated: response.data.data.chunksCreated,
    message: response.data.message,
  };
}

export async function getKnowledgeChunks(documentId: string): Promise<KnowledgeChunk[]> {
  const response = await api.get<{ success: boolean; data: KnowledgeChunk[] }>(`/knowledge/${documentId}/chunks`)
  return response.data.data
}

// Diagnostics: shows what the AI will actually retrieve for this tenant.
export interface KnowledgeDiagnosticsDocument {
  id: string
  title: string
  status: string
  source: string | null
  documentType: string | null
  createdAt: string
  chunkCount: number
  embeddedChunks: number
  retrievable: boolean
  issues: string[]
}

export interface KnowledgeDiagnostics {
  business: {
    id: string
    name: string
    slug: string
    resolved: boolean
    greetingReply: string | null
  }
  embeddingModel: string
  totals: {
    documents: number
    indexed: number
    retrievable: number
    chunks: number
    embeddedChunks: number
  }
  documents: KnowledgeDiagnosticsDocument[]
}

export async function getKnowledgeDiagnostics(): Promise<KnowledgeDiagnostics> {
  const response = await api.get<{ success: boolean; data: KnowledgeDiagnostics }>('/knowledge/diagnostics')
  return response.data.data
}

export interface KnowledgeTestResult {
  query: string
  hitCount: number
  maxSimilarity: number | null
  confidence: 'none' | 'low' | 'medium' | 'high'
  hits: Array<{ source: string; similarity: number | null; excerpt: string }>
}

export async function testKnowledgeQuery(query: string): Promise<KnowledgeTestResult> {
  const response = await api.post<{ success: boolean; data: KnowledgeTestResult }>('/knowledge/test-query', { query })
  return response.data.data
}

// Re-index request: original file bytes are not stored, so the backend returns
// an instruction to re-upload rather than re-deriving vectors in place.
export async function reindexKnowledgeDocument(id: string): Promise<{ requiresReupload: boolean; documentId: string; message: string }> {
  const response = await api.post<{ success: boolean; data: { requiresReupload: boolean; documentId: string }; message: string }>(`/knowledge/${id}/reindex`)
  return { ...response.data.data, message: response.data.message }
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

export async function connectWhatsAppSession(): Promise<WhatsAppStatus> {
  const response = await api.post<{ success: boolean; data: WhatsAppStatus }>('/whatsapp/connect')
  return response.data.data
}

export async function updateWhatsAppConfig(data: {
  phoneNumber?: string;
  businessName?: string;
  businessId?: string;
  webhookUrl?: string;
  apiVersion?: string;
  messageLimit?: string;
}): Promise<WhatsAppConfig> {
  const response = await api.patch<{ success: boolean; data: WhatsAppConfig }>('/whatsapp/config', data)
  return response.data.data
}

// Message Templates
export async function getMessageTemplates(category?: string): Promise<MessageTemplate[]> {
  const url = category ? `/message-templates?category=${encodeURIComponent(category)}` : '/message-templates'
  const response = await api.get<{ success: boolean; data: MessageTemplate[] }>(url)
  return response.data.data
}

export async function createMessageTemplate(data: {
  name: string
  category: string
  description?: string | null
  subject?: string | null
  body: string
  variables?: string[]
  language?: string
  is_active?: boolean
}): Promise<MessageTemplate> {
  const response = await api.post<{ success: boolean; data: MessageTemplate }>('/message-templates', data)
  return response.data.data
}

export async function updateMessageTemplate(id: string, data: {
  name?: string
  category?: string
  description?: string | null
  subject?: string | null
  body?: string
  variables?: string[]
  language?: string
  is_active?: boolean
}): Promise<MessageTemplate> {
  const response = await api.patch<{ success: boolean; data: MessageTemplate }>(`/message-templates/${id}`, data)
  return response.data.data
}

export async function deleteMessageTemplate(id: string): Promise<{ success: boolean; message: string }> {
  const response = await api.delete<{ success: boolean; message: string }>(`/message-templates/${id}`)
  return response.data
}

// Public signup
export async function publicSignup(data: { businessName: string; slug: string; whatsappPhone: string; ownerName: string; email: string; password: string }): Promise<{ business: any; user: any; token: string; expiresIn: string }> {
  const response = await api.post<{ success: boolean; data: { business: any; user: any; token: string; expiresIn: string } }>('/public/signup', data)
  return response.data.data
}

export async function submitContactInquiry(data: { name: string; business?: string; email: string; whatsapp?: string; message: string }): Promise<{ success: boolean; message: string }> {
  const response = await api.post<{ success: boolean; data: any; message: string }>('/public/contact', data)
  return { success: response.data.success, message: response.data.message }
}

export async function createSupportTicket(data: { name: string; email: string; subject: string; message: string; category?: 'technical' | 'billing' | 'feature' | 'other' }): Promise<{ success: boolean; message: string }> {
  const response = await api.post<{ success: boolean; data: any; message: string }>('/public/support', data)
  return { success: response.data.success, message: response.data.message }
}

export async function checkSlugAvailability(slug: string): Promise<{ available: boolean }> {
  const response = await api.get<{ success: boolean; data: { available: boolean } }>(`/public/business/slug/${encodeURIComponent(slug)}/available`)
  return response.data.data
}

export async function checkPhoneAvailability(phone: string): Promise<{ available: boolean }> {
  const response = await api.get<{ success: boolean; data: { available: boolean } }>(`/public/business/phone/${encodeURIComponent(phone)}/available`)
  return response.data.data
}

export async function activateBusiness(id: string): Promise<any> {
  const response = await api.patch<{ success: boolean; data: any }>(`/public/business/${id}/activate`)
  return response.data.data
}

// Subscription / Plans
export async function getPlans(): Promise<Plan[]> {
  const response = await api.get<{ success: boolean; data: Plan[] }>('/billing/plans')
  return response.data.data
}

export async function getSubscription(): Promise<{ subscription: any; trialDaysLeft: number | null; gracePeriodDaysLeft: number | null; isInGracePeriod: boolean; paymentsConfigured?: boolean; paymentProvider?: PaymentProviderInfo | null } | null> {
  const response = await api.get<{ success: boolean; data: any }>('/billing/subscription')
  return response.data.data
}

export async function getSubscriptionHistory(): Promise<any[]> {
  const response = await api.get<{ success: boolean; data: any[] }>('/billing/subscription/history')
  return response.data.data
}

export async function getUsage(): Promise<Record<string, { used: number; limit: number | null }>> {
  const response = await api.get<{ success: boolean; data: Record<string, { used: number; limit: number | null }> }>('/billing/usage')
  return response.data.data
}

// Admin plan management
export async function adminListPlans(): Promise<Plan[]> {
  const response = await api.get<{ success: boolean; data: Plan[] }>('/billing/admin/plans')
  return response.data.data
}

export async function adminGetPlan(id: string): Promise<Plan> {
  const response = await api.get<{ success: boolean; data: Plan }>(`/billing/admin/plans/${id}`)
  return response.data.data
}

export async function adminCreatePlan(data: Partial<Plan>): Promise<Plan> {
  const response = await api.post<{ success: boolean; data: Plan }>('/billing/admin/plans', data)
  return response.data.data
}

export async function adminUpdatePlan(id: string, data: Partial<Plan>): Promise<Plan> {
  const response = await api.put<{ success: boolean; data: Plan }>(`/billing/admin/plans/${id}`, data)
  return response.data.data
}

export async function adminDeletePlan(id: string): Promise<void> {
  await api.delete(`/billing/admin/plans/${id}`)
}

// Billing
export async function createCheckoutSession(data: { planSlug: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }> {
  const response = await api.post<{ success: boolean; data: { url: string } }>('/billing/checkout-session', data)
  return response.data.data
}

export async function createCustomerPortalSession(data: { returnUrl: string }): Promise<{ url: string }> {
  const response = await api.post<{ success: boolean; data: { url: string } }>('/billing/customer-portal', data)
  return response.data.data
}

export type PaymentProviderInfo = {
  id: string
  displayName: string
  configured: boolean
  requiresManualApproval: boolean
  instructions?: {
    accountName: string
    accountNumber: string
    bankName: string
    contactEmail: string
    contactPhone?: string
  }
}

export type PaymentRequest = {
  id: string
  business_id: string
  reference: string
  amount: number
  currency: string
  status: 'pending' | 'confirmed' | 'rejected' | 'expired'
  plan_name?: string
  created_at: string
}

export async function getPaymentRequest(): Promise<PaymentRequest | null> {
  const response = await api.get<{ success: boolean; data: PaymentRequest | null }>('/billing/subscription/payment-request')
  return response.data.data
}

export type PaymentLedgerEntry = {
  id: string
  amount: number
  currency: string
  status: string
  provider: string
  provider_payment_id?: string | null
  method?: string | null
  paid_at?: string | null
  created_at: string
}

export type PaymentRequestEntry = {
  id: string
  reference: string
  amount: number
  currency: string
  status: string
  method?: string | null
  created_at: string
  confirmed_at?: string | null
}

export async function getPaymentHistory(): Promise<{ payments: PaymentLedgerEntry[]; paymentRequests: PaymentRequestEntry[] }> {
  const response = await api.get<{ success: boolean; data: { payments: PaymentLedgerEntry[]; paymentRequests: PaymentRequestEntry[] } }>(
    '/billing/subscription/payments'
  )
  return response.data.data
}

export async function cancelSubscriptionSelf(): Promise<{ cancelAtPeriodEnd: string | null }> {
  const response = await api.post<{ success: boolean; data: { cancelAtPeriodEnd: string | null } }>(
    '/billing/subscription/cancel'
  )
  return response.data.data
}

export async function resumeSubscriptionSelf(): Promise<void> {
  await api.post<{ success: boolean }>('/billing/subscription/resume')
}

export type AdminPaymentRequest = PaymentRequest & {
  business_name?: string
  plan_name?: string
  notes?: string | null
}

export async function getAdminPaymentRequests(status?: string): Promise<AdminPaymentRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const response = await api.get<{ success: boolean; data: AdminPaymentRequest[] }>(`/billing/admin/payment-requests${query}`)
  return response.data.data
}

export async function confirmPaymentRequest(id: string, notes?: string): Promise<AdminPaymentRequest> {
  const response = await api.post<{ success: boolean; data: AdminPaymentRequest }>(
    `/billing/admin/payment-requests/${encodeURIComponent(id)}/confirm`,
    { notes }
  )
  return response.data.data
}

export async function rejectPaymentRequest(id: string, notes?: string): Promise<AdminPaymentRequest> {
  const response = await api.post<{ success: boolean; data: AdminPaymentRequest }>(
    `/billing/admin/payment-requests/${encodeURIComponent(id)}/reject`,
    { notes }
  )
  return response.data.data
}

export async function getOwnerDashboard(): Promise<OwnerDashboardStats> {
  const response = await api.get<{ success: boolean; data: OwnerDashboardStats }>('/owner/dashboard')
  return response.data.data
}

export async function getFinancialMetrics(): Promise<FinancialMetrics> {
  const response = await api.get<{ success: boolean; data: FinancialMetrics }>('/owner/financials')
  return response.data.data
}

export async function getConversionMetrics(): Promise<ConversionMetrics> {
  const response = await api.get<{ success: boolean; data: ConversionMetrics }>('/owner/conversion-metrics')
  return response.data.data
}

// Invitations
export async function acceptInvite(token: string, password: string): Promise<StaffUser> {
  const response = await api.post<{ success: boolean; data: StaffUser }>('/staff/accept-invite', { token, password })
  return response.data.data
}

export async function createStaffUser(data: { first_name: string; last_name: string; email: string; phone?: string | null; role?: string; timezone?: string; password?: string }): Promise<StaffUser> {
  const response = await api.post<{ success: boolean; data: StaffUser }>('/staff/users', data)
  return response.data.data
}

export async function updateStaffUser(id: string, data: Partial<{ first_name: string; last_name: string; email: string; phone?: string | null; role?: string; timezone?: string; password?: string }>): Promise<StaffUser> {
  const response = await api.put<{ success: boolean; data: StaffUser }>(`/staff/users/${id}`, data)
  return response.data.data
}

export async function updateStaffStatus(id: string, status: string): Promise<StaffUser> {
  const response = await api.patch<{ success: boolean; data: StaffUser }>(`/staff/users/${id}/status`, { status })
  return response.data.data
}

export async function deleteStaffUser(id: string): Promise<void> {
  await api.delete(`/staff/users/${id}`)
}

// Settings
interface ExportedSetting {
  key: string
  value: string | null
  dataType: string
  description: string | null
  isSystem: boolean
}

interface ExportSettingsResponse {
  exportedAt: string
  tenantId: string
  settings: ExportedSetting[]
}

export async function exportSettings(): Promise<ExportSettingsResponse> {
  const response = await api.get<{ success: boolean; data: ExportSettingsResponse }>('/settings/export')
  return response.data.data
}

export async function importSettings(settingsList: Array<{ key: string; value: string }>): Promise<{ updated: number; failed: number }> {
  const response = await api.post<{ success: boolean; data: { updated: number; failed: number } }>('/settings/import', { settings: settingsList })
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

export async function clearSystemCache(): Promise<{ success: boolean; message: string }> {
  const response = await api.post<{ success: boolean; message: string }>('/system/cache/clear')
  return response.data
}

// Admin Owner Endpoints
export async function getAdminUsers(): Promise<StaffUser[]> {
  const response = await api.get<{ success: boolean; data: StaffUser[] }>('/admin/users')
  return response.data.data
}

export async function getAdminUser(id: string): Promise<StaffUser> {
  const response = await api.get<{ success: boolean; data: StaffUser }>(`/admin/users/${id}`)
  return response.data.data
}

export async function updateAdminUser(id: string, data: { role?: string; status?: string }): Promise<StaffUser> {
  const response = await api.put<{ success: boolean; data: StaffUser }>(`/admin/users/${id}`, data)
  return response.data.data
}

export async function deleteAdminUser(id: string): Promise<void> {
  await api.delete(`/admin/users/${id}`)
}

export async function getAdminBusinesses(): Promise<Array<{ id: string; name: string; slug: string; status: string }>> {
  const response = await api.get('/admin/businesses')
  return (response.data as { success: boolean; data: Array<{ id: string; name: string; slug: string; status: string }> }).data
}

export async function createTenantAdmin(data: { email: string; password: string; first_name: string; last_name: string; business_id: string; role?: string; status?: string }): Promise<any> {
  const response = await api.post('/admin/users', data)
  return (response.data as { success: boolean; data: any }).data
}

export async function getAdminSubscriptions(): Promise<any[]> {
  const response = await api.get<{ success: boolean; data: any[] }>('/admin/subscriptions')
  return response.data.data
}

export async function getAdminContactInquiries(params?: { page?: number; limit?: number; source?: string }): Promise<{ data: any[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const response = await api.get<{ success: boolean; data: any[]; meta: any }>('/admin/contact-inquiries', { params })
  return { data: response.data.data, meta: response.data.meta }
}

export async function cancelSubscription(id: string): Promise<any> {
  const response = await api.post<{ success: boolean; data: any }>(`/admin/subscriptions/${id}/cancel`)
  return response.data.data
}

export async function activateSubscription(id: string): Promise<any> {
  const response = await api.post<{ success: boolean; data: any }>(`/admin/subscriptions/${id}/activate`)
  return response.data.data
}

export async function getAdminApiConfig(): Promise<Record<string, string>> {
  const response = await api.get<{ success: boolean; data: Record<string, string> }>('/admin/api-config')
  return response.data.data
}

export async function updateAdminApiConfig(configs: Record<string, string>): Promise<any> {
  const response = await api.put<{ success: boolean; data: any }>('/admin/api-config', { configs })
  return response.data.data
}

export async function getAdminSettings(): Promise<Record<string, string>> {
  const response = await api.get<{ success: boolean; data: Record<string, { value: string | null }> }>('/admin/settings')
  return Object.fromEntries(Object.entries(response.data.data).map(([key, setting]) => [key, setting.value ?? '']))
}

export async function updateAdminSettings(settings: Record<string, string>): Promise<any> {
  const response = await api.put<{ success: boolean; data: any }>('/admin/settings', { settings })
  return response.data.data
}

export async function createAdminSetting(setting: { key: string; value: string; description?: string }): Promise<void> {
  await api.post('/admin/settings', setting)
}

// Beta
export async function getBetaStatus(): Promise<{ open: boolean; waitlistUrl?: string; estimatedLaunch?: string }> {
  const response = await api.get<{ success: boolean; data: any }>('/beta/status')
  return response.data.data
}

export async function validateBetaInviteApi(email: string, token?: string): Promise<{ valid: boolean; inviteType?: string; error?: string }> {
  const response = await api.post<{ success: boolean; data: any }>('/beta/validate-invite', { email, token })
  return response.data.data
}

export async function registerBetaInterestApi(email: string, inviteToken?: string): Promise<any> {
  const response = await api.post<{ success: boolean; data: any }>('/beta/register', { email, inviteToken })
  return response.data.data
}

// CRM Integration (Odoo)
export async function getCrmSettings(): Promise<CrmSettings> {
  const response = await api.get<{ success: boolean; data: CrmSettings }>('/integrations/crm')
  return response.data.data
}

export async function updateCrmSettings(data: CrmSettingsUpdateRequest): Promise<CrmSettings> {
  const response = await api.put<{ success: boolean; data: CrmSettings }>('/integrations/crm', data)
  return response.data.data
}

export async function testCrmConnection(): Promise<{ success: boolean; message: string }> {
  const response = await api.post<{ success: boolean; message: string }>('/integrations/crm/test')
  return { success: response.data.success, message: response.data.message }
}



