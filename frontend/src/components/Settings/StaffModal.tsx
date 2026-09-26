import { useState, useEffect } from 'react'
import type { StaffUser } from '@/types'

interface StaffModalProps {
  isOpen: boolean
  staff: StaffUser | null
  onClose: () => void
  onSave: (data: StaffFormData) => void
  isLoading: boolean
}

export interface StaffFormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  role: 'super_admin' | 'admin' | 'manager' | 'sales' | 'support' | 'technician'
  timezone: string
}

const defaultFormData: StaffFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  role: 'sales',
  timezone: 'UTC',
}

const roles: { value: StaffFormData['role']; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales', label: 'Sales' },
  { value: 'support', label: 'Support' },
  { value: 'technician', label: 'Technician' },
]

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export function StaffModal({ isOpen, staff, onClose, onSave, isLoading }: StaffModalProps) {
  const [formData, setFormData] = useState<StaffFormData>(defaultFormData)
  const [errors, setErrors] = useState<Partial<Record<keyof StaffFormData, string>>>({})

  const isEditing = !!staff

  useEffect(() => {
    if (staff) {
      setFormData({
        first_name: staff.first_name,
        last_name: staff.last_name,
        email: staff.email,
        phone: staff.phone || '',
        role: staff.role,
        timezone: staff.timezone || 'UTC',
      })
    } else {
      setFormData(defaultFormData)
    }
    setErrors({})
  }, [staff, isOpen])

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof StaffFormData, string>> = {}
    if (!formData.first_name.trim()) newErrors.first_name = 'First name is required'
    if (!formData.last_name.trim()) newErrors.last_name = 'Last name is required'
    if (!formData.email.trim()) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email'
    if (!formData.role) newErrors.role = 'Role is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSave(formData)
  }

  const handleChange = (field: keyof StaffFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="fixed inset-0 bg-surface-900/50 transition-opacity" onClick={onClose} />
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pb-4 pt-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-surface-900 mb-4">
                {isEditing ? 'Edit Staff Member' : 'Add Staff Member'}
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">First Name *</label>
                    <input type="text" value={formData.first_name} onChange={(e) => handleChange('first_name', e.target.value)} className={`input ${errors.first_name ? 'border-danger-500' : ''}`} placeholder="John" />
                    {errors.first_name && <p className="text-xs text-danger-600 mt-1">{errors.first_name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">Last Name *</label>
                    <input type="text" value={formData.last_name} onChange={(e) => handleChange('last_name', e.target.value)} className={`input ${errors.last_name ? 'border-danger-500' : ''}`} placeholder="Doe" />
                    {errors.last_name && <p className="text-xs text-danger-600 mt-1">{errors.last_name}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Email *</label>
                  <input type="email" value={formData.email} onChange={(e) => handleChange('email', e.target.value)} className={`input ${errors.email ? 'border-danger-500' : ''}`} placeholder="john@example.com" />
                  {errors.email && <p className="text-xs text-danger-600 mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} className="input" placeholder="+1 234 567 8900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Role *</label>
                  <select value={formData.role} onChange={(e) => handleChange('role', e.target.value as StaffFormData['role'])} className={`input ${errors.role ? 'border-danger-500' : ''}`}>
                    {roles.map((role) => (<option key={role.value} value={role.value}>{role.label}</option>))}
                  </select>
                  {errors.role && <p className="text-xs text-danger-600 mt-1">{errors.role}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Timezone</label>
                  <select value={formData.timezone} onChange={(e) => handleChange('timezone', e.target.value)} className="input">
                    {timezones.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
                  </select>
                </div>
              </div>
            </div>
            <div className="bg-surface-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
              <button type="submit" disabled={isLoading} className="inline-flex w-full justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                {isEditing ? 'Update' : 'Add'} Staff
              </button>
              <button type="button" className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-surface-900 shadow-sm ring-1 ring-inset ring-surface-300 hover:bg-surface-50 sm:mt-0 sm:w-auto" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
