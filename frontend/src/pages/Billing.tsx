import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getSubscription, getUsage, getPlans, createCheckoutSession, createCustomerPortalSession, getBetaStatus } from '@/services/api'

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
  paymentsConfigured?: boolean
}

type UsageData = Record<string, { used: number; limit: number | null }>

type BetaStatus = {
  open: boolean
  waitlistUrl?: string
  estimatedLaunch?: string
}

type PlanOption = {
  id: string
  name: string
  slug: string
  price_monthly: number
  price_yearly?: number | null
  currency: string
  features: Record<string, boolean | undefined>
  limits: Record<string, number | undefined>
}

export default function BillingPage() {
  const [sub, setSub] = useState<SubscriptionData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>('professional')

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [subData, usageData, plansData, beta] = await Promise.all([
        getSubscription(),
        getUsage(),
        getPlans(),
        getBetaStatus().catch(() => ({ open: true } as BetaStatus)),
      ])
      setSub(subData)
      setUsage(usageData)
      setPlans(plansData)
      setBetaStatus(beta)
      if (plansData.length > 0 && !plansData.some(p => p.slug === selectedPlanSlug)) {
        setSelectedPlanSlug(plansData[0].slug)
      }
    } catch (error: any) {
      setLoadError(error?.message || 'Failed to load billing info')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpgrade = async (planSlug: string) => {
    try {
      setUpgrading(true)
      const result = await createCheckoutSession({
        planSlug,
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

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-100">Billing & Plan</h1>
          <p className="text-sm text-surface-400">Manage your subscription and view usage.</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-6">
          <p className="text-surface-100 font-medium">Couldn&apos;t load billing info</p>
          <p className="text-sm text-surface-400 mt-1">{loadError}</p>
          <button
            onClick={() => load()}
            className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const plan = sub?.subscription?.plan
  const isTrialing = sub?.subscription?.status === 'trialing'
  const daysLeft = sub?.trialDaysLeft ?? null
  const usageMetrics = usage || {}
  const paymentsConfigured = sub?.paymentsConfigured !== false
  const currentPlanSlug = plan?.slug

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Billing & Plan</h1>
        <p className="text-sm text-surface-400">Manage your subscription and view usage.</p>
      </div>

      {/* Beta notice when Stripe is not configured */}
      {!paymentsConfigured && (
        <div className="bg-warning-50 border border-warning-100 rounded-xl p-4">
          <p className="text-sm font-medium text-warning-900">You&apos;re on the free beta</p>
          <p className="text-xs text-warning-800">
            Billing is not yet enabled on this environment. Enjoy full access during the public beta.
            Paid plans will be available soon.
          </p>
        </div>
      )}

      {/* Trial banner */}
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
          {paymentsConfigured && (
            <button
              onClick={() => handleUpgrade(currentPlanSlug || selectedPlanSlug)}
              disabled={upgrading}
              className="px-4 py-2 bg-warning-600 hover:bg-warning-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {upgrading ? 'Loading...' : 'Upgrade now'}
            </button>
          )}
        </div>
      )}

      {/* Current plan or plan selector */}
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
            {paymentsConfigured && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleUpgrade(currentPlanSlug || selectedPlanSlug)}
                  disabled={upgrading}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Change plan
                </button>
                <button
                  onClick={handleManageBilling}
                  disabled={upgrading}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed text-surface-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Manage billing
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-surface-400 text-sm">No active plan. Choose a plan to get started.</p>
            {paymentsConfigured && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedPlanSlug}
                  onChange={(e) => setSelectedPlanSlug(e.target.value)}
                  className="bg-surface-800 border border-surface-700 text-surface-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {plans.map(p => (
                    <option key={p.slug} value={p.slug}>{p.name} — ${p.price_monthly}/mo</option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpgrade(selectedPlanSlug)}
                  disabled={upgrading}
                  className="shrink-0 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {upgrading ? 'Loading...' : 'Choose plan'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Plan comparison (shown when no plan is selected or during trial) */}
      {plans.length > 0 && (
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map(p => (
              <div
                key={p.slug}
                className={`border rounded-xl p-4 ${currentPlanSlug === p.slug ? 'border-primary-500 bg-surface-800' : 'border-surface-700 bg-surface-900'}`}
              >
                <p className="text-surface-100 font-medium">{p.name}</p>
                <p className="text-xl font-bold text-surface-100">${p.price_monthly}<span className="text-xs text-surface-400">/mo</span></p>
                {p.price_yearly && (
                  <p className="text-xs text-surface-400">${p.price_yearly}/yr</p>
                )}
                <ul className="mt-3 space-y-1 text-xs text-surface-300">
                  {Object.entries(p.features).filter(([, v]) => v).map(([key]) => (
                    <li key={key} className="flex items-center gap-1">
                      <span className="text-primary-400">&#10003;</span>
                      <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
                {paymentsConfigured && currentPlanSlug !== p.slug && (
                  <button
                    onClick={() => handleUpgrade(p.slug)}
                    disabled={upgrading}
                    className="mt-3 w-full px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {upgrading ? 'Loading...' : 'Select'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage */}
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
