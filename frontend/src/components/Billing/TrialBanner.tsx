import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getSubscription, createCustomerPortalSession } from '@/services/api'

type SubscriptionStatus = {
  subscription: {
    id: string
    status: string
    trial_ends_at?: string | null
    plan?: {
      name: string
      slug: string
      price_monthly: number
    }
  } | null
  trialDaysLeft: number | null
}

export default function TrialBanner() {
  const [data, setData] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sub = await getSubscription()
        if (!cancelled) {
          setData(sub as SubscriptionStatus | null)
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

  if (loading || !data?.subscription || data.subscription.status !== 'trialing') {
    return null
  }

  const days = data.trialDaysLeft ?? 0
  if (days > 3 && days < 100) {
    return null
  }

  const message =
    days <= 1
      ? 'Your trial expires today. Subscribe now to keep access.'
      : days <= 3
        ? `Your trial expires in ${days} days. Subscribe now to avoid interruption.`
        : `Trial ends in ${days} days.`;

  const handleUpgrade = async () => {
    try {
      const result = await createCustomerPortalSession({
        returnUrl: window.location.origin + '/billing',
      })
      window.location.href = result.url
    } catch (error) {
      toast.error('Unable to open billing portal')
    }
  }

  return (
    <div className="bg-warning-50 border-b border-warning-100 text-warning-900">
      <div className="mx-auto max-w-[1600px] px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm font-medium">
            {message}
            {data.subscription.plan ? (
              <span className="ml-2 text-warning-800">
                Current plan: {data.subscription.plan.name} — ${data.subscription.plan.price_monthly}/mo
              </span>
            ) : null}
          </p>
          <button
            onClick={handleUpgrade}
            className="inline-flex items-center justify-center rounded-lg bg-warning-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-warning-700 transition-colors"
          >
            Upgrade now
          </button>
        </div>
      </div>
    </div>
  )
}
