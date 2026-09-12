export interface Contact {
  id: string
  phone: string
  display_name: string
  email: string
  company: string
  source: 'whatsapp' | 'website' | 'facebook' | 'instagram' | 'referral' | 'manual' | 'other'
  preferred_language: string
  opt_in: boolean
  tags: string[]
  notes: string
  status: 'active' | 'blocked' | 'archived'
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface ContactCreateRequest {
  phone: string
  display_name?: string
  email?: string
  company?: string
  source?: string
  preferred_language?: string
  opt_in?: boolean
  tags?: string[]
  notes?: string
  status?: string
}

export interface CustomerFact {
  id?: string
  contact_id: string
  fact_key: string
  fact_value: string
  confidence?: number
  source?: string
  created_at?: string
  updated_at?: string
}
