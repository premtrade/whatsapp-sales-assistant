import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getSubscription, getUsage, createCheckoutSession, createCustomerPortalSession } from '@/services/api'

type SubscriptionData = {
  subscription: {
    id: string
    status: string
    trial_ends_at?: string | null
    current_period_end?: string | null
    plan?: {
      name: string
      slug: string
      price_monthly: number
      price_yearly?: number | null
      currency: string
      limits: Record<string, number | undefined>
      features: Record<string, boolean | undefined>
    }
  } | null
  trialDaysLeft: number | null
}

type UsageData = Record<string, { used: number; limit: number | null }>

export default function BillingPage() {
  const [sub, setSub] = useState<SubscriptionData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [subData, usageData] = await Promise.all([
          getSubscription(),
          getUsage(),
        ])
        setSub(subData)
        setUsage(usageData)
      } catch {
        toast.error('Failed to load billing info')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleUpgrade = async () => {
    try {
      setUpgrading(true)
      const result = await createCheckoutSession({
        planSlug: 'professional',
        successUrl: window.location.origin + '/billing?success=1',
        cancelUrl: window.location.origin + '/billing?canceled=1',
      })
      window.location.href = result.url
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start checkout')
      setUpgrading(false)
    }
  }

  const handleManageBilling = async () => {
    try {
      const result = await createCustomerPortalSession({
        returnUrl: window.location.origin + '/billing',
      })
      window.location.href = result.url
    } catch (error: any) {
      toast.error(error?.message || 'Failed to open billing portal')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  const plan = sub?.subscription?.plan
  const isTrialing = sub?.subscription?.status === 'trialing'
  const daysLeft = sub?.trialDaysLeft ?? null
  const usageMetrics = usage || {}

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Billing & Plan</h1>
        <p className="text-sm text-surface-400">Manage your subscription and view usage.</p>
      </div>

      {isTrialing && (
        <div className="bg-warning-50 border border-warning-100 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-warning-900">Trial active</p>
            <p className="text-xs text-warning-800">
              {daysLeft !== null && daysLeft > 0
                ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`
                : 'Your trial has ended. Upgrade to continue.'}
            </p>
          </div>
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="px-4 py-2 bg-warning-600 hover:bg-warning-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {upgrading ? 'Loading...' : 'Upgrade now'}
          </button>
        </div>
      )}

      <div className="bg-surface-900 border border-surface-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-4">Current Plan</h2>
        {plan ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-surface-100 font-medium">{plan.name}</p>
                <p className="text-xs text-surface-400">Status: {sub?.subscription?.status}</p>
              </div>
              <div className="text-right">
                <p className="text-surface-100 font-semibold">${plan.price_monthly}<span className="text-xs text-surface-400">/mo</span></p>
                {plan.price_yearly && (
                  <p className="text-xs text-surface-400">${plan.price_yearly}/yr</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleUpgrade}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Change plan
              </button>
              <button
                onClick={handleManageBilling}
                className="px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-200 text-sm font-medium rounded-lg transition-colors"
              >
                Manage billing
              </button>
            </div>
          </div>
        ) : (
          <p className="text-surface-400 text-sm">No active plan. Choose a plan to get started.</p>
        )}
      </div>

      {plan && (
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4">Usage</h2>
          <div className="space-y-4">
            {Object.entries(usageMetrics).map(([metric, data]) => {
              const limit = data.limit
              const pct = limit && limit > 0 ? Math.min(((data.used || 0) / limit) * 100, 100) : null
              const isOver = pct !== null && pct >= 100
              const isNear = pct !== null && pct >= 80 && pct < 100

              return (
                <div key={metric}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-surface-300 capitalize">{metric.replace(/_/g, ' ')}</span>
                    <span className={`text-xs ${isOver ? 'text-danger-400' : isNear ? 'text-warning-400' : 'text-surface-400'}`}>
                      {data.used || 0} / {limit === null || limit === -1 ? 'Unlimited' : limit}
                    </span>
                  </div>
                  {pct !== null && limit !== -1 && (
                    <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isOver ? 'bg-danger-500' : isNear ? 'bg-warning-500' : 'bg-primary-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
