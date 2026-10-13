export interface Contact {
  id: string
  phone: string
  /** WhatsApp LID digits (e.g. 251294258356378) — NOT a dialable phone. */
  wa_lid?: string | null
  /** Exact WAHA reply JID (...@lid or ...@c.us). */
  wa_chat_id?: string | null
  /** TRUE when phone is a real verified number rather than LID digits. */
  phone_verified?: boolean
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

/**
 * WAHA/WEBJS reports many senders as `<lid>@lid` (e.g. 251294258356378@lid).
 * That LID is a privacy-preserving identifier — NOT a dialable phone number —
 * so never render it as the phone. `phone` may still hold LID digits for
 * older rows until `GET /api/{session}/lids/{lid}` resolves them.
 */
export function isWhatsAppLid(value?: string | null): boolean {
  const digits = (value || '').replace(/\D/g, '')
  return digits.length >= 14
}

/** Best human-readable label: real display name, else verified phone, else WhatsApp. */
export function contactDisplayName(contact?: Pick<Contact, 'display_name' | 'phone' | 'wa_lid'> | null): string {
  const name = (contact?.display_name || '').trim()
  if (name && !isWhatsAppLid(name)) return name
  const phone = (contact?.phone || '').trim()
  if (phone && !isWhatsAppLid(phone) && phone !== contact?.wa_lid) return phone
  return 'WhatsApp Customer'
}

/** Dialable/displayable phone, or null when only a LID is known. */
export function contactPhone(contact?: Pick<Contact, 'phone' | 'wa_lid' | 'phone_verified'> | null): string | null {
  const phone = (contact?.phone || '').trim()
  if (!phone) return null
  if (contact?.phone_verified) return phone
  if (isWhatsAppLid(phone)) return null
  if (contact?.wa_lid && phone === contact.wa_lid) return null
  return phone
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
