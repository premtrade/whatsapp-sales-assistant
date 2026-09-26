export interface Plan {
  id: string
  name: string
  slug: string
  price_monthly: number
  price_yearly?: number | null
  currency: string
  features: Record<string, boolean | undefined>
  limits: Record<string, number | undefined>
  sort_order: number
  is_active: boolean
  is_public: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  business_id: string
  plan_id: string
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired' | 'paused'
  current_period_start: string
  current_period_end: string
  trial_ends_at?: string | null
  canceled_at?: string | null
  grace_period_ends_at?: string | null
  external_customer_id?: string | null
  external_subscription_id?: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  plan?: Plan
  trialDaysLeft?: number | null
}

export interface UsageRecord {
  metric: string
  used: number
  limit: number | null
}

export interface OwnerDashboardStats {
  businesses: {
    total: number
    active: number
    trialing: number
    suspended: number
    pending: number
    newLast30Days: number
  }
  subscriptions: {
    total: number
    active: number
    trialing: number
    past_due: number
    canceled: number
  }
  revenue: {
    mrr: number
    arr: number
    currency: string
  }
  trials: {
    expiringIn7Days: number
    expiringIn3Days: number
    expiringIn1Day: number
  }
  recentBusinesses: {
    id: string
    name: string
    slug: string
    status: string
    created_at: string
  }[]
}

export interface FinancialMetrics {
  revenue: {
    mrr: number
    arr: number
    currency: string
    byPlan: { plan: string; count: number; mrr: number }[]
  }
  subscriptions: {
    total: number
    active: number
    trialing: number
    past_due: number
    canceled: number
    expired: number
  }
  conversions: {
    trialToPaid: number
    trialConversionRate: number
  }
  churn: {
    canceledLast30Days: number
    churnRate: number
  }
}
