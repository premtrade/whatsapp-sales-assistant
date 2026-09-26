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
    mrr: number;
    arr: number;
    currency: string;
    byPlan: { plan: string; count: number; mrr: number }[];
  };
  subscriptions: {
    total: number;
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
    expired: number;
  };
  conversions: {
    trialToPaid: number;
    trialConversionRate: number;
  };
  churn: {
    canceledLast30Days: number;
    churnRate: number;
  };
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
    const totalActive = (ss['active'] || 0) + (ss['trialing'] || 0) + (ss['past_due'] || 0);
    const churnRate = totalActive > 0 ? (canceled30 / totalActive) * 100 : 0;

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
        trialConversionRate: trialToPaid > 0 ? 100 : 0,
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
