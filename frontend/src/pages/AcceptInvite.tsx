import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { acceptInvite } from '@/services/api'

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => acceptInvite(token, password),
    onSuccess: () => {
      toast.success('Invitation accepted! You can now log in.')
      navigate('/login')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to accept invitation')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (!token.trim()) {
      toast.error('Invitation token is required')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">Accept Invitation</h1>
          <p className="text-surface-500">Set your password to join your team.</p>
        </div>
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Invitation Token</label>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </div>
          <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full">
            {mutation.isPending ? 'Accepting...' : 'Accept Invitation'}
          </button>
          <p className="text-sm text-surface-500 text-center">
            <Link to="/login" className="text-primary-600 hover:underline">Back to login</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
