export interface PublicSignupRequest {
  businessName: string
  slug: string
  whatsappPhone: string
  ownerName: string
  email: string
  password: string
}

export interface PublicSignupResponse {
  business: {
    id: string
    name: string
    slug: string
    status: string
    whatsapp_phone: string
    waha_session_name: string
    currency: string
    timezone: string
  }
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    businessId: string
  }
  token: string
  expiresIn: string
}

export interface AvailabilityResponse {
  available: boolean
}

export interface Business {
  id: string
  name: string
  slug: string
  description?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  currency: string
  timezone: string
  logo_url?: string | null
  whatsapp_phone?: string | null
  waha_session_name?: string | null
  status: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}
