export interface Setting {
  id: string
  setting_key: string
  setting_value: string | null
  data_type: 'string' | 'integer' | 'decimal' | 'boolean' | 'json'
  description: string | null
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface CompanySettings {
  company_name: string
  company_email: string
  company_phone: string
  company_address: string
  timezone: string
}

export interface SettingsUpdateRequest {
  setting_key: string
  setting_value: string
}
