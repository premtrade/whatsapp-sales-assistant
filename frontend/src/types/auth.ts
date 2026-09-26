export interface AuthState {
  staff: StaffUser | null
  token: string | null
  isAuthenticated: boolean
}

export interface StaffUser {
  id: string
  employee_number: string
  first_name: string
  last_name: string
  display_name: string
  email: string
  phone: string
  role: 'super_admin' | 'admin' | 'manager' | 'sales' | 'support' | 'technician'
  status: 'active' | 'inactive' | 'suspended'
  timezone: string
  metadata: Record<string, unknown>
  businessId?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  staff: StaffUser
}
