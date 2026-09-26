import { query } from '../utils/database';
import logger from '../utils/logger';

export interface BillingMetric {
  label: string;
  value: number | string;
  change?: number;
}

export interface RevenueTimeSeries {
  date: string;
  mrr: number;
  newBusinesses: number;
  canceledBusinesses: number;
}

export async function getBillingMetrics(): Promise<BillingMetric[]> {
  try {
    const [
      activeSubs,
      trialingSubs,
      pastDueSubs,
      canceledSubs,
      expiredSubs,
      mrrResult,
      avgRevenuePerUser,
      totalUsage,
    ] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'past_due'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'canceled'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'expired'`),
      query<{ mrr: string }>(`
        SELECT COALESCE(SUM(p.price_monthly), 0) as mrr
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('active', 'trialing', 'past_due')
      `),
      query<{ arpu: string }>(`
        SELECT COALESCE(AVG(p.price_monthly), 0) as arpu
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active'
      `),
      query<{ total: string }>(`SELECT COALESCE(SUM(used), 0) as total FROM usage_records`),
    ]);

    const mrr = parseFloat(mrrResult.rows[0]?.mrr || '0');
    const arpu = parseFloat(avgRevenuePerUser.rows[0]?.arpu || '0');
    const activeCount = parseInt(activeSubs.rows[0]?.count || '0', 10);

    return [
      { label: 'Active Subscriptions', value: activeCount },
      { label: 'Trialing Subscriptions', value: parseInt(trialingSubs.rows[0]?.count || '0', 10) },
      { label: 'Past Due Subscriptions', value: parseInt(pastDueSubs.rows[0]?.count || '0', 10) },
      { label: 'Canceled Subscriptions', value: parseInt(canceledSubs.rows[0]?.count || '0', 10) },
      { label: 'Expired Subscriptions', value: parseInt(expiredSubs.rows[0]?.count || '0', 10) },
      { label: 'Monthly Recurring Revenue', value: mrr },
      { label: 'Annual Recurring Revenue', value: mrr * 12 },
      { label: 'Average Revenue Per User', value: arpu },
      { label: 'Total Usage Records', value: parseInt(totalUsage.rows[0]?.total || '0', 10) },
    ];
  } catch (error) {
    logger.error('Failed to fetch billing metrics', { error });
    throw error;
  }
}

export async function getRevenueTimeSeries(days = 30): Promise<RevenueTimeSeries[]> {
  try {
    const result = await query<RevenueTimeSeries>(`
      WITH daily AS (
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as new_businesses,
          COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled_businesses
        FROM businesses
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
      ),
      mrr_daily AS (
        SELECT 
          DATE(created_at) as date,
          SUM(p.price_monthly) as mrr
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('active', 'trialing', 'past_due')
          AND s.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
      )
      SELECT 
        d.date,
        COALESCE(m.mrr, 0) as mrr,
        d.new_businesses,
        d.canceled_businesses
      FROM daily d
      LEFT JOIN mrr_daily m ON d.date = m.date
      ORDER BY d.date ASC
    `);
    return result.rows;
  } catch (error) {
    logger.error('Failed to fetch revenue time series', { error });
    throw error;
  }
}

export async function getUsageByMetric(): Promise<{ metric: string; used: number; limit: number }[]> {
  try {
    const result = await query<{ metric: string; used: number; limit: number }>(`
      SELECT 
        u.metric,
        SUM(u.used) as used,
        MAX(u.limit_value) as limit
      FROM usage_records u
      GROUP BY u.metric
    `);
    return result.rows.map((r) => ({
      metric: r.metric,
      used: r.used,
      limit: r.limit || 0,
    }));
  } catch (error) {
    logger.error('Failed to fetch usage by metric', { error });
    throw error;
  }
}
