import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getSubscription, createCustomerPortalSession, createCheckoutSession } from '@/services/api'

type SubscriptionStatus = {
  subscription: {
    id: string
    status: string
    trial_ends_at?: string | null
    current_period_end?: string | null
    grace_period_ends_at?: string | null
    external_customer_id?: string | null
    plan?: {
      name: string
      slug: string
      price_monthly: number
    }
  } | null
  trialDaysLeft: number | null
  gracePeriodDaysLeft: number | null
  isInGracePeriod: boolean
  paymentsConfigured?: boolean
}

type BannerState =
  | { type: 'hidden' }
  | { type: 'trial-warning'; days: number }
  | { type: 'trial-critical'; days: number }
  | { type: 'grace-period'; days: number }
  | { type: 'expired' }

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

  if (loading || !data?.subscription) {
    return null
  }

  const sub = data.subscription
  const status = sub.status

  const computeBanner = (): BannerState => {
    if (data.isInGracePeriod) {
      return { type: 'grace-period', days: data.gracePeriodDaysLeft ?? 0 }
    }

    if (status === 'expired') {
      const graceDays = data.gracePeriodDaysLeft ?? 0
      if (graceDays > 0) {
        return { type: 'grace-period', days: graceDays }
      }
      return { type: 'expired' }
    }

    if (status === 'trialing') {
      const days = data.trialDaysLeft ?? 0
      if (days <= 3) return { type: 'trial-critical', days }
      if (days <= 7) return { type: 'trial-warning', days }
      return { type: 'hidden' }
    }

    if (status === 'past_due') {
      const graceDays = data.gracePeriodDaysLeft ?? 0
      if (graceDays > 0) {
        return { type: 'grace-period', days: graceDays }
      }
      return { type: 'expired' }
    }

    return { type: 'hidden' }
  }

  const banner = computeBanner()

  if (banner.type === 'hidden') {
    return null
  }

  const message =
    banner.type === 'trial-warning'
      ? `Your trial expires in ${banner.days} days. Subscribe now to avoid interruption.`
      : banner.type === 'trial-critical'
        ? `Your trial expires in ${banner.days} day${banner.days === 1 ? '' : 's'}. Subscribe now to keep access.`
        : banner.type === 'grace-period'
        ? (status === 'past_due'
          ? `Your payment is past due. You have ${banner.days} day${banner.days === 1 ? '' : 's'} of grace access remaining.`
          : `Your trial has ended. You have ${banner.days} day${banner.days === 1 ? '' : 's'} of access remaining.`)
        : (status === 'past_due' ? 'Your payment is past due. Update billing to restore access.' : 'Your trial has ended. Please upgrade to continue.')

  const ctaLabel = banner.type === 'grace-period' || banner.type === 'expired' ? 'Upgrade now' : 'View plans'

  const handleUpgrade = async () => {
    try {
      const hasCustomerId = !!sub.external_customer_id
      if (hasCustomerId) {
        const result = await createCustomerPortalSession({
          returnUrl: window.location.origin + '/billing',
        })
        window.location.href = result.url
      } else {
        const result = await createCheckoutSession({
          planSlug: 'professional',
          successUrl: window.location.origin + '/billing?success=1',
          cancelUrl: window.location.origin + '/billing?canceled=1',
        })
        window.location.href = result.url
      }
    } catch (error) {
      toast.error('Unable to open billing portal')
    }
  }

  const bgColor =
    banner.type === 'grace-period' || banner.type === 'expired'
      ? 'bg-danger-50'
      : banner.type === 'trial-critical'
        ? 'bg-warning-50'
        : 'bg-warning-50'

  const borderColor =
    banner.type === 'grace-period' || banner.type === 'expired'
      ? 'border-danger-100'
      : 'border-warning-100'

  const textColor =
    banner.type === 'grace-period' || banner.type === 'expired'
      ? 'text-danger-900'
      : 'text-warning-900'

  const mutedColor =
    banner.type === 'grace-period' || banner.type === 'expired'
      ? 'text-danger-800'
      : 'text-warning-800'

  const buttonBg =
    banner.type === 'grace-period' || banner.type === 'expired'
      ? 'bg-danger-600 hover:bg-danger-700'
      : 'bg-warning-600 hover:bg-warning-700'

  return (
    <div className={`${bgColor} border-b ${borderColor} ${textColor}`}>
      <div className="mx-auto max-w-[1600px] px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {message}
              {sub.plan ? (
                <span className={`ml-2 ${mutedColor}`}>
                  Current plan: {sub.plan.name} — ${sub.plan.price_monthly}/mo
                </span>
              ) : null}
            </p>
          </div>
          {data.paymentsConfigured !== false && (
            <button
              onClick={handleUpgrade}
              className={`inline-flex items-center justify-center rounded-lg ${buttonBg} px-3 py-1.5 text-xs font-semibold text-white transition-colors`}
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
