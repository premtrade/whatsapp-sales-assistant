import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { publicSignup, checkSlugAvailability, checkPhoneAvailability, activateBusiness } from '@/services/api'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import type { Business } from '@/types'

type SignupStep = 'details' | 'setup' | 'complete'

export default function SignupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<SignupStep>('details')
  const [business, setBusiness] = useState<Business | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState({
    businessName: '',
    slug: '',
    whatsappPhone: '',
    ownerName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const slugCheck = useQuery({
    queryKey: ['slug-availability', form.slug],
    queryFn: () => checkSlugAvailability(form.slug),
    enabled: form.slug.length >= 3,
  })

  const phoneCheck = useQuery({
    queryKey: ['phone-availability', form.whatsappPhone],
    queryFn: () => checkPhoneAvailability(form.whatsappPhone),
    enabled: form.whatsappPhone.length >= 7,
  })

  useEffect(() => {
    if (slugCheck.data?.available === false) {
      toast.error('This slug is already taken')
    }
  }, [slugCheck.data?.available])

  useEffect(() => {
    if (phoneCheck.data?.available === false) {
      toast.error('This WhatsApp phone is already registered')
    }
  }, [phoneCheck.data?.available])

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

  const handleSignup = (e: FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (slugCheck.data?.available === false) {
      toast.error('Please choose a different slug')
      return
    }
    if (phoneCheck.data?.available === false) {
      toast.error('Please choose a different WhatsApp phone')
      return
    }
    signupMutation.mutate({
      businessName: form.businessName,
      slug: form.slug,
      whatsappPhone: form.whatsappPhone,
      ownerName: form.ownerName,
      email: form.email,
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
          <p className="text-surface-500">Create your WhatsApp sales assistant in 30 seconds.</p>
        </div>
        <form onSubmit={handleSignup} className="card p-6 space-y-4">
          <div>
            <label className="label">Business Name</label>
            <input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required maxLength={255} />
          </div>
          <div>
            <label className="label">Slug</label>
            <div className="relative">
              <input className="input pr-16" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required minLength={3} maxLength={50} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">
                {slugCheck.isFetching ? 'Checking...' : slugCheck.data?.available ? 'Available' : form.slug.length >= 3 ? 'Taken' : ''}
              </span>
            </div>
          </div>
          <div>
            <label className="label">WhatsApp Phone</label>
            <div className="relative">
              <input className="input pr-16" value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} required />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400">
                {phoneCheck.isFetching ? 'Checking...' : phoneCheck.data?.available ? 'Available' : form.whatsappPhone.length >= 7 ? 'Taken' : ''}
              </span>
            </div>
          </div>
          <div>
            <label className="label">Your Full Name</label>
            <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" className="input" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required minLength={8} />
          </div>
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
