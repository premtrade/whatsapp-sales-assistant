import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { publicSignup, checkSlugAvailability, checkPhoneAvailability, activateBusiness } from '@/services/api'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import type { Business } from '@/types'

type SignupStep = 'details' | 'setup' | 'complete'

type FormErrors = Partial<Record<keyof typeof defaults, string>>

const defaults = {
  businessName: '',
  slug: '',
  whatsappPhone: '',
  ownerName: '',
  email: '',
  password: '',
  confirmPassword: '',
} as const

function validateField(name: keyof typeof defaults, value: string | undefined, form: typeof defaults | Partial<typeof defaults>, slugAvailable?: boolean, phoneAvailable?: boolean): string {
  const safeValue = value || ''
  switch (name) {
    case 'businessName':
      if (!safeValue.trim()) return 'Business name is required'
      if (safeValue.trim().length > 255) return 'Business name must be under 255 characters'
      return ''
    case 'slug':
      if (!safeValue.trim()) return 'Slug is required'
      if (safeValue.trim().length < 3) return 'Slug must be at least 3 characters'
      if (safeValue.trim().length > 50) return 'Slug must be under 50 characters'
      if (slugAvailable === false) return 'This slug is already taken'
      return ''
    case 'whatsappPhone':
      if (!safeValue.trim()) return 'WhatsApp phone is required'
      if (phoneAvailable === false) return 'This WhatsApp phone is already registered'
      return ''
    case 'ownerName':
      if (!safeValue.trim()) return 'Your full name is required'
      return ''
    case 'email':
      if (!safeValue.trim()) return 'Email is required'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeValue)) return 'Enter a valid email address'
      return ''
    case 'password':
      if (!safeValue) return 'Password is required'
      if (safeValue.length < 8) return 'Password must be at least 8 characters'
      return ''
    case 'confirmPassword':
      if (!safeValue) return 'Please confirm your password'
      if (safeValue !== form.password) return 'Passwords do not match'
      return ''
    default:
      return ''
  }
}

export default function SignupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<SignupStep>('details')
  const [business, setBusiness] = useState<Business | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState(defaults)
  const [touched, setTouched] = useState<Partial<Record<keyof typeof defaults, boolean>>>({})
  const [errors, setErrors] = useState<FormErrors>({})

  const slugCheck = useQuery({
    queryKey: ['slug-availability', form.slug],
    queryFn: () => checkSlugAvailability(form.slug),
    enabled: form.slug.trim().length >= 3,
  })

  const phoneCheck = useQuery({
    queryKey: ['phone-availability', form.whatsappPhone],
    queryFn: () => checkPhoneAvailability(form.whatsappPhone),
    enabled: form.whatsappPhone.trim().length >= 7,
  })

  const validate = (partial?: Partial<typeof form>) => {
    const current = partial || form
    const next: FormErrors = {}
    ;(['businessName', 'slug', 'whatsappPhone', 'ownerName', 'email', 'password', 'confirmPassword'] as const).forEach((field) => {
      const message = validateField(field, current[field], current, slugCheck.data?.available, phoneCheck.data?.available)
      if (message) next[field] = message
    })
    setErrors(next)
    return next
  }

  useEffect(() => {
    validate()
  }, [slugCheck.data?.available, phoneCheck.data?.available])

  useEffect(() => {
    if (slugCheck.data?.available === false && touched.slug) {
      toast.error('This slug is already taken')
    }
  }, [slugCheck.data?.available, touched.slug])

  useEffect(() => {
    if (phoneCheck.data?.available === false && touched.whatsappPhone) {
      toast.error('This WhatsApp phone is already registered')
    }
  }, [phoneCheck.data?.available, touched.whatsappPhone])

  const signupMutation = useMutation({
    mutationFn: publicSignup,
    onSuccess: (result) => {
      setBusiness(result.business as Business)
      setToken(result.token)
      toast.success('Account created! Let\'s set up your WhatsApp.')
      setStep('setup')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Signup failed')
    },
  })

  const activateMutation = useMutation({
    mutationFn: () => activateBusiness(business!.id),
    onSuccess: () => {
      toast.success('Business activated!')
      setStep('complete')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Activation failed')
    },
  })

  const handleChange = (name: keyof typeof defaults, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }))
    if (touched[name]) {
      validate({ ...form, [name]: value })
    }
  }

  const handleBlur = (name: keyof typeof defaults) => {
    setTouched((prev) => ({ ...prev, [name]: true }))
    validate()
  }

  const handleSignup = (e: FormEvent) => {
    e.preventDefault()
    const touchedFields = Object.keys(defaults).reduce<Partial<Record<keyof typeof defaults, boolean>>>((acc, key) => {
      acc[key as keyof typeof defaults] = true
      return acc
    }, {})
    setTouched(touchedFields)
    const next = validate()
    if (Object.keys(next).length > 0) {
      toast.error('Please fix the errors above')
      return
    }
    signupMutation.mutate({
      businessName: form.businessName.trim(),
      slug: form.slug.trim(),
      whatsappPhone: form.whatsappPhone.trim(),
      ownerName: form.ownerName.trim(),
      email: form.email.trim(),
      password: form.password,
    })
  }

  const handleFinish = () => {
    if (token) {
      localStorage.setItem('auth_token', token)
      if (business) {
        const staffUser = { id: '', email: form.email, firstName: form.ownerName.split(' ')[0], lastName: form.ownerName.split(' ').slice(1).join(' ') || '', role: 'admin', businessId: business.id }
        localStorage.setItem('staff_user', JSON.stringify(staffUser))
      }
    }
    navigate('/dashboard')
  }

  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="max-w-md w-full card p-8 text-center">
          <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-surface-900 mb-2">You're all set!</h2>
          <p className="text-surface-500 mb-6">Your WhatsApp sales assistant is ready. Start by uploading your knowledge base or sending a test message.</p>
          <button onClick={handleFinish} className="btn btn-primary w-full">Go to Dashboard</button>
        </div>
      </div>
    )
  }

  if (step === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="max-w-md w-full card p-8">
          <h2 className="text-2xl font-bold text-surface-900 mb-2">Connect WhatsApp</h2>
          <p className="text-surface-500 mb-6">Scan the QR code in your WAHA dashboard to connect your WhatsApp number. Your session name is:</p>
          <div className="bg-surface-100 rounded-lg p-4 mb-4">
            <code className="text-sm text-surface-700 break-all">{business?.waha_session_name || 'loading...'}</code>
          </div>
          <p className="text-sm text-surface-500 mb-6">Once connected, we'll verify your number and activate your account.</p>
          {activateMutation.isPending && <LoadingState type="card" count={1} />}
          <button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending} className="btn btn-primary w-full">
            {activateMutation.isPending ? 'Activating...' : 'I\'ve connected WhatsApp'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">Get Started</h1>
          <p className="text-surface-500">Create your WhatsApp sales assistant in 20 minutes.</p>
        </div>
        <form onSubmit={handleSignup} className="card p-6 space-y-4" noValidate>
          <Field label="Business Name" error={touched.businessName ? errors.businessName : undefined}>
            <input
              className="input"
              value={form.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              onBlur={() => handleBlur('businessName')}
              required
              maxLength={255}
            />
          </Field>
          <Field label="Slug" error={touched.slug ? errors.slug : undefined}>
            <div className="relative">
              <input
                className="input pr-16"
                value={form.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                onBlur={() => handleBlur('slug')}
                required
                minLength={3}
                maxLength={50}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">
                {slugCheck.isFetching ? 'Checking...' : slugCheck.data?.available ? 'Available' : form.slug.length >= 3 ? 'Taken' : ''}
              </span>
            </div>
          </Field>
          <Field label="WhatsApp Phone" error={touched.whatsappPhone ? errors.whatsappPhone : undefined}>
            <div className="relative">
              <input
                className="input pr-16"
                value={form.whatsappPhone}
                onChange={(e) => handleChange('whatsappPhone', e.target.value)}
                onBlur={() => handleBlur('whatsappPhone')}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">
                {phoneCheck.isFetching ? 'Checking...' : phoneCheck.data?.available ? 'Available' : form.whatsappPhone.length >= 7 ? 'Taken' : ''}
              </span>
            </div>
          </Field>
          <Field label="Your Full Name" error={touched.ownerName ? errors.ownerName : undefined}>
            <input
              className="input"
              value={form.ownerName}
              onChange={(e) => handleChange('ownerName', e.target.value)}
              onBlur={() => handleBlur('ownerName')}
              required
            />
          </Field>
          <Field label="Email" error={touched.email ? errors.email : undefined}>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              required
            />
          </Field>
          <Field label="Password" error={touched.password ? errors.password : undefined}>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              onBlur={() => handleBlur('password')}
              required
              minLength={8}
            />
          </Field>
          <Field label="Confirm Password" error={touched.confirmPassword ? errors.confirmPassword : undefined}>
            <input
              type="password"
              className="input"
              value={form.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              onBlur={() => handleBlur('confirmPassword')}
              required
              minLength={8}
            />
          </Field>
          <button type="submit" disabled={signupMutation.isPending} className="btn btn-primary w-full">
            {signupMutation.isPending ? 'Creating Account...' : 'Create Account'}
          </button>
          <p className="text-sm text-surface-500 text-center">
            Already have an account? <Link to="/login" className="text-primary-600 hover:underline">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
