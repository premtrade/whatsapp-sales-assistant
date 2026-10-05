import { useEffect, useState } from 'react'
import { getSubscription, getUsage } from '@/services/api'

type UsageData = Record<string, { used: number; limit: number | null }>

type SubscriptionData = {
  subscription: {
    id: string
    status: string
    trial_ends_at?: string | null
    grace_period_ends_at?: string | null
    plan?: {
      name: string
      slug: string
      price_monthly: number
      limits?: Record<string, number | undefined>
    }
  } | null
  trialDaysLeft: number | null
  gracePeriodDaysLeft: number | null
  isInGracePeriod: boolean
  paymentsConfigured?: boolean
}

type MetricInfo = {
  key: string
  label: string
  used: number
  limit: number | null
  pct: number | null
}

export default function UsageWarningBanner() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [subData, usageData] = await Promise.all([getSubscription(), getUsage()])
        if (!cancelled) {
          setData(subData as SubscriptionData | null)
          setUsage(usageData)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || !data?.subscription) {
    return null
  }

  const sub = data.subscription
  if (!sub.plan?.limits) return null

  const metrics: MetricInfo[] = Object.entries(usage || {}).map(([key, value]) => {
    const planLimit = sub.plan?.limits?.[key]
    const limit = value.limit ?? planLimit ?? null
    const used = value.used || 0
    const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : null
    return {
      key,
      label: key.replace(/_/g, ' '),
      used,
      limit,
      pct,
    }
  })

  const nearLimit = metrics.filter(m => m.pct !== null && m.pct >= 80)
  if (nearLimit.length === 0) return null

  const isOver = nearLimit.some(m => m.pct !== null && m.pct >= 100)

  return (
    <div className={`border rounded-xl p-4 ${isOver ? 'bg-danger-50 border-danger-100' : 'bg-warning-50 border-warning-100'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className={`text-sm font-medium ${isOver ? 'text-danger-900' : 'text-warning-900'}`}>
            {isOver ? 'Plan limits reached' : 'Approaching plan limits'}
          </p>
          <ul className="mt-1 space-y-1">
            {nearLimit.map(m => (
              <li key={m.key} className={`text-xs ${isOver ? 'text-danger-800' : 'text-warning-800'}`}>
                <span className="capitalize">{m.label}</span>: {m.used} / {m.limit === null || m.limit === -1 ? 'Unlimited' : m.limit}
                {m.pct !== null && ` (${Math.round(m.pct)}%)`}
              </li>
            ))}
          </ul>
        </div>
        <a
          href="/billing"
          className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors ${isOver ? 'bg-danger-600 hover:bg-danger-700' : 'bg-warning-600 hover:bg-warning-700'}`}
        >
          {data.paymentsConfigured === false ? 'Review plan details' : 'Upgrade plan'}
        </a>
      </div>
    </div>
  )
}
