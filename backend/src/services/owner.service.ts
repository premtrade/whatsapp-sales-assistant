import { query } from '../utils/database';
import logger from '../utils/logger';

export interface OwnerDashboardStats {
  businesses: {
    total: number;
    active: number;
    trialing: number;
    suspended: number;
    pending: number;
    newLast30Days: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    currency: string;
  };
  trials: {
    expiringIn7Days: number;
    expiringIn3Days: number;
    expiringIn1Day: number;
  };
  recentBusinesses: {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
  }[];
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

export interface ConversionMetrics {
  overall: {
    totalTrials: number
    converted: number
    conversionRate: number
    avgDaysToConvert: number | null
  }
  byPlan: {
    plan: string
    totalTrials: number
    converted: number
    conversionRate: number
    avgDaysToConvert: number | null
  }[]
  featureUsage: {
    conversionStatus: string
    businesses: number
    avgConversations: number | null
    avgMessages: number | null
    avgQuotes: number | null
    avgAppointments: number | null
    avgHandoffs: number | null
    pctWithConversations: number | null
    pctWithMessages: number | null
    pctWithQuotes: number | null
    pctWithAppointments: number | null
    pctWithHandoffs: number | null
  }[]
}

export async function getOwnerDashboardStats(): Promise<OwnerDashboardStats> {
  try {
    const [
      businessStats,
      subStats,
      mrrResult,
      trials7,
      trials3,
      trials1,
      newBiz30,
      recentBusinesses,
    ] = await Promise.all([
      query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM businesses WHERE deleted_at IS NULL GROUP BY status`),
      query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM subscriptions GROUP BY status`),
      query<{ mrr: string; currency: string }>(`
        SELECT COALESCE(SUM(p.price_monthly), 0) as mrr, COALESCE(MAX(p.currency), 'USD') as currency
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('active', 'trialing', 'past_due')
      `),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing' AND trial_ends_at <= NOW() + INTERVAL '7 days' AND trial_ends_at > NOW()`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing' AND trial_ends_at <= NOW() + INTERVAL '3 days' AND trial_ends_at > NOW()`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing' AND trial_ends_at <= NOW() + INTERVAL '1 day' AND trial_ends_at > NOW()`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM businesses WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'`),
      query<{ id: string; name: string; slug: string; status: string; created_at: string }>(`
        SELECT id, name, slug, status, created_at
        FROM businesses
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10
      `),
    ]);

    const mapStatus = (rows: { status: string; count: string }[]) => {
      const map: Record<string, number> = {};
      rows.forEach((row) => { map[row.status] = parseInt(row.count, 10); });
      return map;
    };

    const bs = mapStatus(businessStats.rows);
    const ss = mapStatus(subStats.rows);
    const mrr = parseFloat(mrrResult.rows[0]?.mrr || '0');
    const currency = mrrResult.rows[0]?.currency || 'USD';

    return {
      businesses: {
        total: Object.values(bs).reduce((a, b) => a + b, 0),
        active: bs['active'] || 0,
        trialing: bs['trialing'] || 0,
        suspended: bs['suspended'] || 0,
        pending: bs['pending'] || 0,
        newLast30Days: parseInt(newBiz30.rows[0]?.count || '0', 10),
      },
      subscriptions: {
        total: Object.values(ss).reduce((a, b) => a + b, 0),
        active: ss['active'] || 0,
        trialing: ss['trialing'] || 0,
        past_due: ss['past_due'] || 0,
        canceled: ss['canceled'] || 0,
      },
      revenue: {
        mrr,
        arr: mrr * 12,
        currency,
      },
      trials: {
        expiringIn7Days: parseInt(trials7.rows[0]?.count || '0', 10),
        expiringIn3Days: parseInt(trials3.rows[0]?.count || '0', 10),
        expiringIn1Day: parseInt(trials1.rows[0]?.count || '0', 10),
      },
      recentBusinesses: recentBusinesses.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        created_at: r.created_at,
      })),
    };
  } catch (error) {
    logger.error('Failed to fetch owner dashboard stats', { error });
    throw error;
  }
}

export async function getFinancialMetrics(): Promise<FinancialMetrics> {
  try {
    const [
      mrrResult,
      byPlanResult,
      subStats,
      conversionsResult,
      canceled30Result,
      totalSubsResult,
    ] = await Promise.all([
      query<{ mrr: string; currency: string }>(`
        SELECT COALESCE(SUM(p.price_monthly), 0) as mrr, COALESCE(MAX(p.currency), 'USD') as currency
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('active', 'trialing', 'past_due')
      `),
      query<{ plan: string; count: string; mrr: string }>(`
        SELECT p.name as plan, COUNT(s.id) as count, COALESCE(SUM(p.price_monthly), 0) as mrr
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('active', 'trialing', 'past_due')
        GROUP BY p.name
      `),
      query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM subscriptions GROUP BY status`),
      query<{ count: string }>(`
        SELECT COUNT(*) as count FROM subscriptions
        WHERE status = 'active'
          AND trial_ends_at IS NOT NULL
          AND created_at <= NOW() - INTERVAL '30 days'
      `),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'canceled' AND updated_at >= NOW() - INTERVAL '30 days'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status IN ('active', 'trialing', 'past_due')`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing'`),
    ]);

    const mapStatus = (rows: { status: string; count: string }[]) => {
      const map: Record<string, number> = {};
      rows.forEach((row) => { map[row.status] = parseInt(row.count, 10); });
      return map;
    };

    const ss = mapStatus(subStats.rows);
    const mrr = parseFloat(mrrResult.rows[0]?.mrr || '0');
    const currency = mrrResult.rows[0]?.currency || 'USD';
    const trialToPaid = parseInt(conversionsResult.rows[0]?.count || '0', 10);
    const canceled30 = parseInt(canceled30Result.rows[0]?.count || '0', 10);
    const totalTrials = parseInt(totalSubsResult.rows[0]?.count || '0', 10);
    const totalActive = (ss['active'] || 0) + (ss['trialing'] || 0);
    const churnRate = totalActive > 0 ? (canceled30 / totalActive) * 100 : 0;
    const trialConversionRate = totalTrials > 0 ? (trialToPaid / totalTrials) * 100 : 0;

    return {
      revenue: {
        mrr,
        arr: mrr * 12,
        currency,
        byPlan: byPlanResult.rows.map((r) => ({
          plan: r.plan,
          count: parseInt(r.count, 10),
          mrr: parseFloat(r.mrr || '0'),
        })),
      },
      subscriptions: {
        total: Object.values(ss).reduce((a, b) => a + b, 0),
        active: ss['active'] || 0,
        trialing: ss['trialing'] || 0,
        past_due: ss['past_due'] || 0,
        canceled: ss['canceled'] || 0,
        expired: ss['expired'] || 0,
      },
      conversions: {
        trialToPaid,
        trialConversionRate: Math.round(trialConversionRate * 100) / 100,
      },
      churn: {
        canceledLast30Days: canceled30,
        churnRate: Math.round(churnRate * 100) / 100,
      },
    };
  } catch (error) {
    logger.error('Failed to fetch financial metrics', { error });
    throw error;
  }
}

export async function getConversionMetrics(): Promise<ConversionMetrics> {
  try {
    const [
      overallResult,
      byPlanResult,
      featureUsageResult,
    ] = await Promise.all([
      query<{
        total_trials: string
        converted: string
        conversion_rate: string
        avg_days_to_convert: string | null
      }>(`
        SELECT
          COUNT(*) as total_trials,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as converted,
          ROUND(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate,
          ROUND(AVG(CASE WHEN status = 'active' AND COALESCE((metadata->>'converted_at')::timestamptz, first_paid.paid_at) IS NOT NULL
            THEN EXTRACT(EPOCH FROM (COALESCE((metadata->>'converted_at')::timestamptz, first_paid.paid_at) - created_at)) / 86400 ELSE NULL END), 1) as avg_days_to_convert
        FROM subscriptions s
        LEFT JOIN LATERAL (
          SELECT MIN(paid_at) AS paid_at FROM payments p
          WHERE p.subscription_id = s.id AND p.business_id = s.business_id AND p.status = 'succeeded' AND p.paid_at IS NOT NULL
        ) first_paid ON TRUE
        WHERE status IN ('active', 'trialing', 'past_due', 'expired', 'canceled')
          AND trial_ends_at IS NOT NULL
      `),
      query<{
        plan: string
        total_trials: string
        converted: string
        conversion_rate: string
        avg_days_to_convert: string | null
      }>(`
        SELECT
          p.name as plan,
          COUNT(s.id) as total_trials,
          SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) as converted,
          ROUND(SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(s.id), 0) * 100, 2) as conversion_rate,
          ROUND(AVG(CASE WHEN s.status = 'active' AND COALESCE((s.metadata->>'converted_at')::timestamptz, first_paid.paid_at) IS NOT NULL
            THEN EXTRACT(EPOCH FROM (COALESCE((s.metadata->>'converted_at')::timestamptz, first_paid.paid_at) - s.created_at)) / 86400 ELSE NULL END), 1) as avg_days_to_convert
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        LEFT JOIN LATERAL (
          SELECT MIN(paid_at) AS paid_at FROM payments payment
          WHERE payment.subscription_id = s.id AND payment.business_id = s.business_id AND payment.status = 'succeeded' AND payment.paid_at IS NOT NULL
        ) first_paid ON TRUE
        WHERE s.status IN ('active', 'trialing', 'past_due', 'expired', 'canceled')
          AND s.trial_ends_at IS NOT NULL
        GROUP BY p.name
        ORDER BY conversion_rate DESC
      `),
      query<{
        conversion_status: string
        businesses: string
        avg_conversations: string | null
        avg_messages: string | null
        avg_quotes: string | null
        avg_appointments: string | null
        avg_handoffs: string | null
        pct_with_conversations: string | null
        pct_with_messages: string | null
        pct_with_quotes: string | null
        pct_with_appointments: string | null
        pct_with_handoffs: string | null
      }>(`
        WITH trial_periods AS (
          SELECT
            s.business_id,
            s.status,
            s.created_at as trial_start,
            COALESCE(s.trial_ends_at, s.updated_at) as trial_end
          FROM subscriptions s
          WHERE s.status IN ('active', 'trialing', 'past_due', 'expired', 'canceled')
            AND s.trial_ends_at IS NOT NULL
        ),
        biz_features AS (
          SELECT
            tb.business_id,
            tb.status,
            COUNT(DISTINCT c.id) as conversations,
            COUNT(DISTINCT m.id) as messages,
            COUNT(DISTINCT q.id) as quotes,
            COUNT(DISTINCT a.id) as appointments,
            COUNT(DISTINCT h.id) as handoffs
          FROM trial_periods tb
          LEFT JOIN conversations c ON c.business_id = tb.business_id
            AND c.created_at BETWEEN tb.trial_start AND tb.trial_end
          LEFT JOIN messages m ON m.conversation_id = c.id
            AND m.created_at BETWEEN tb.trial_start AND tb.trial_end
          LEFT JOIN contacts ct ON ct.business_id = tb.business_id
          LEFT JOIN quotes q ON q.contact_id = ct.id
            AND q.created_at BETWEEN tb.trial_start AND tb.trial_end
          LEFT JOIN appointments a ON a.contact_id = ct.id
            AND a.created_at BETWEEN tb.trial_start AND tb.trial_end
          LEFT JOIN handoffs h ON h.conversation_id = c.id
            AND h.created_at BETWEEN tb.trial_start AND tb.trial_end
          GROUP BY tb.business_id, tb.status
        )
        SELECT
          CASE WHEN status = 'active' THEN 'converted' ELSE 'not_converted' END as conversion_status,
          COUNT(*) as businesses,
          ROUND(AVG(conversations), 1) as avg_conversations,
          ROUND(AVG(messages), 1) as avg_messages,
          ROUND(AVG(quotes), 1) as avg_quotes,
          ROUND(AVG(appointments), 1) as avg_appointments,
          ROUND(AVG(handoffs), 1) as avg_handoffs,
          ROUND(SUM(CASE WHEN conversations > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct_with_conversations,
          ROUND(SUM(CASE WHEN messages > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct_with_messages,
          ROUND(SUM(CASE WHEN quotes > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct_with_quotes,
          ROUND(SUM(CASE WHEN appointments > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct_with_appointments,
          ROUND(SUM(CASE WHEN handoffs > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct_with_handoffs
        FROM biz_features
        GROUP BY conversion_status
      `),
    ]);

    const overall = overallResult.rows[0];
    const byPlan = byPlanResult.rows.map((r) => ({
      plan: r.plan,
      totalTrials: parseInt(r.total_trials, 10),
      converted: parseInt(r.converted, 10),
      conversionRate: parseFloat(r.conversion_rate || '0'),
      avgDaysToConvert: r.avg_days_to_convert !== null ? parseFloat(r.avg_days_to_convert) : null,
    }));
    const featureUsage = featureUsageResult.rows.map((r) => ({
      conversionStatus: r.conversion_status,
      businesses: parseInt(r.businesses, 10),
      avgConversations: r.avg_conversations !== null ? parseFloat(r.avg_conversations) : null,
      avgMessages: r.avg_messages !== null ? parseFloat(r.avg_messages) : null,
      avgQuotes: r.avg_quotes !== null ? parseFloat(r.avg_quotes) : null,
      avgAppointments: r.avg_appointments !== null ? parseFloat(r.avg_appointments) : null,
      avgHandoffs: r.avg_handoffs !== null ? parseFloat(r.avg_handoffs) : null,
      pctWithConversations: r.pct_with_conversations !== null ? parseFloat(r.pct_with_conversations) : null,
      pctWithMessages: r.pct_with_messages !== null ? parseFloat(r.pct_with_messages) : null,
      pctWithQuotes: r.pct_with_quotes !== null ? parseFloat(r.pct_with_quotes) : null,
      pctWithAppointments: r.pct_with_appointments !== null ? parseFloat(r.pct_with_appointments) : null,
      pctWithHandoffs: r.pct_with_handoffs !== null ? parseFloat(r.pct_with_handoffs) : null,
    }));

    return {
      overall: {
        totalTrials: parseInt(overall?.total_trials || '0', 10),
        converted: parseInt(overall?.converted || '0', 10),
        conversionRate: parseFloat(overall?.conversion_rate || '0'),
        avgDaysToConvert: overall?.avg_days_to_convert != null ? parseFloat(overall.avg_days_to_convert) : null,
      },
      byPlan,
      featureUsage,
    };
  } catch (error) {
    logger.error('Failed to fetch conversion metrics', { error });
    throw error;
  }
}
