export interface KnowledgeDocument {
  id: string
  title: string
  document_type: 'pdf' | 'docx' | 'txt' | 'html' | 'markdown' | 'website' | 'faq' | 'policy' | 'other'
  source: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  checksum: string | null
  language: string
  status: 'pending' | 'processing' | 'indexed' | 'failed' | 'archived'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface KnowledgeChunk {
  id: string
  document_id: string
  chunk_number: number
  chunk_text: string
  token_count: number | null
  embedding_model: string | null
  embedding: number[] | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface KnowledgeDocumentCreateRequest {
  title: string
  document_type: string
  source?: string
  file_name?: string
  mime_type?: string
  file_size?: number
  language?: string
  metadata?: Record<string, unknown>
}
