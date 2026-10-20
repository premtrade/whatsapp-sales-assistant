import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getAdminSubscriptions, cancelSubscription, activateSubscription, createCheckoutSession, getAdminPaymentRequests, confirmPaymentRequest, rejectPaymentRequest } from '@/services/api'
import type { Plan } from '@/types/subscription'
import { useAuth } from '@/context/AuthContext'

export default function SubscriptionManagementPage() {
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [paymentRequests, setPaymentRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { staff } = useAuth()

  useEffect(() => {
    loadSubscriptions()
    loadPaymentRequests()
  }, [])

  async function loadSubscriptions() {
    try {
      const data = await getAdminSubscriptions()
      setSubscriptions(data)
    } catch (err) {
      console.error('Failed to load subscriptions', err)
      toast.error('Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  async function loadPaymentRequests() {
    try {
      setPaymentRequests(await getAdminPaymentRequests())
    } catch (err) {
      console.error('Failed to load payment requests', err)
    }
  }

  async function handleConfirmPayment(id: string) {
    if (!window.confirm('Confirm that this payment was received? The subscription will be activated immediately.')) return
    try {
      await confirmPaymentRequest(id)
      toast.success('Payment confirmed and subscription activated')
      loadPaymentRequests()
      loadSubscriptions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm payment')
    }
  }

  async function handleRejectPayment(id: string) {
    const notes = window.prompt('Reason for rejecting this payment request (optional):') ?? undefined
    try {
      await rejectPaymentRequest(id, notes)
      toast.success('Payment request rejected')
      loadPaymentRequests()
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject payment')
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Are you sure you want to cancel this subscription? This action cannot be undone.')) return
    try {
      await cancelSubscription(id)
      toast.success('Subscription canceled')
      loadSubscriptions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel subscription')
    }
  }

  async function handleActivate(id: string) {
    if (!window.confirm('Are you sure you want to activate this subscription?')) return
    try {
      await activateSubscription(id)
      toast.success('Subscription activated')
      loadSubscriptions()
    } catch (err: any) {
      toast.error(err.message || 'Failed to activate subscription')
    }
  }

  async function handleUpgrade(id: string) {
    const plan = (window.prompt('Select plan (month/year):') || 'month').toLowerCase()
    if (!plan) return
    try {
      const businessId = (JSON.parse(localStorage.getItem('waflo_staff') || '{}') as any)?.business_id
      if (!businessId) {
        toast.error('Could not determine business ID. Please contact support.')
        return
      }
      const { url } = await createCheckoutSession({ planSlug: plan, successUrl: `${window.location.origin}/dashboard`, cancelUrl: `${window.location.origin}/dashboard` })
      window.open(url, '_blank')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upgrade subscription')
    }
  }

  function daysLeft(sub: any): number | null {
    if (sub.status === 'trialing' && sub.trial_ends_at) {
      const days = Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000)
      return Math.max(0, days)
    }
    if (sub.status === 'past_due' || sub.status === 'expired') {
      const graceEnd = sub.grace_period_end ? new Date(sub.grace_period_end).getTime() : Date.now()
      const days = Math.ceil((graceEnd - Date.now()) / 86400000)
      return Math.max(0, days)
    }
    return null
  }

  function formatDays(days: number): string {
    if (days === 0) return '0 days'
    if (days === 1) return '1 day'
    return `${days} days`
  }

  const statusColors: Record<string, string> = {
    active: 'bg-success-500/10 text-success-400',
    trialing: 'bg-warning-500/10 text-warning-400',
    past_due: 'bg-error-500/10 text-error-400',
    canceled: 'bg-surface-800 text-surface-400',
    expired: 'bg-surface-800 text-surface-400',
    paused: 'bg-info-500/10 text-info-400'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Subscription Management</h1>
        <p className="text-sm text-surface-400">Manage platform subscriptions and billing.</p>
      </div>

      {paymentRequests.length > 0 && (
        <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800">
            <h2 className="text-sm font-semibold text-surface-100">Payment requests awaiting confirmation</h2>
            <p className="text-xs text-surface-400 mt-1">
              Offline payments (bank transfer). Confirm once the money has actually arrived — this activates the
              customer&apos;s subscription immediately.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-950 text-surface-400">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 font-medium">Reference</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">Business</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">Plan</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">Amount</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">Requested</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {paymentRequests.map((req: any) => (
                  <tr key={req.id} className="hover:bg-surface-800/50">
                    <td className="px-4 py-3 text-surface-200 text-xs font-mono">{req.reference}</td>
                    <td className="px-4 py-3 text-surface-300">{req.business_name || req.business_id}</td>
                    <td className="px-4 py-3 text-surface-300">{req.plan_name || '-'}</td>
                    <td className="px-4 py-3 text-surface-300">{req.amount} {req.currency}</td>
                    <td className="px-4 py-3 text-surface-400 text-xs">
                      {req.created_at ? new Date(req.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleConfirmPayment(req.id)}
                          className="text-xs px-2 py-1 bg-success-500 hover:bg-success-600 text-white rounded"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleRejectPayment(req.id)}
                          className="text-xs px-2 py-1 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-950 text-surface-400">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium">Business ID</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Plan</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Status</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Start Date</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">End Date</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Trial Ends</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">External ID</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-surface-500">No subscriptions found.</td>
                </tr>
              ) : (
                subscriptions.map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-surface-800/50">
                    <td className="px-4 py-3 text-surface-300 text-xs font-mono">{sub.business_id || '-'}</td>
                    <td className="px-4 py-3 text-surface-300">{sub.plan_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[sub.status] || 'bg-surface-800 text-surface-400'}`}>
                        {sub.status.replace('_', ' ').toUpperCase()}
                      </span>
                      {(sub.status === 'trialing' || sub.status === 'past_due') && (() => {
                        const remainingDays = daysLeft(sub)
                        return remainingDays !== null && (
                          <span className="text-xs text-surface-400 ml-2">
                            {sub.status === 'trialing' ? `Trial: ` : `Grace: `}
                            {remainingDays === 0 ? 'Expired' : formatDays(remainingDays)}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-surface-300">{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-surface-300">{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-surface-300">{sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-surface-300 text-break">{sub.external_subscription_id || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCancel(sub.id)}
                          className="text-xs px-2 py-1 bg-error-500 hover:bg-error-600 text-white rounded"
                          disabled={sub.status === 'canceled' || sub.status === 'expired'}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleActivate(sub.id)}
                          className="text-xs px-2 py-1 bg-success-500 hover:bg-success-600 text-white rounded"
                          disabled={sub.status !== 'canceled'}
                        >
                          Activate
                        </button>
                        {sub.status === 'expired' && (
                          <button
                            onClick={() => handleUpgrade(sub.id)}
                            className="text-xs px-2 py-1 bg-primary-500 hover:bg-primary-600 text-white rounded"
                          >
                            Upgrade Now
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}