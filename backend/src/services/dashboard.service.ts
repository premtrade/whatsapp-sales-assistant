import { query } from '../utils/database';
import logger from '../utils/logger';

export interface DashboardStats {
  conversations: { total: number; active: number; waitingAgent: number; waitingCustomer: number; closed: number; archived: number; };
  handoffs: { total: number; pending: number; accepted: number; completed: number; cancelled: number; };
  quotes: { total: number; draft: number; sent: number; accepted: number; rejected: number; expired: number; };
  appointments: { total: number; scheduled: number; confirmed: number; completed: number; cancelled: number; noShow: number; };
  contacts: { total: number; active: number; blocked: number; archived: number; };
  recentActivity: { conversationsLast24h: number; messagesLast24h: number; handoffsLast24h: number; };
  pipeline: { totalQuotes: number; draft: number; sent: number; accepted: number; rejected: number; conversionRate: number; totalValue: number; };
  trends: { conversationsByDay: { date: string; count: number }[]; messagesByDay: { date: string; count: number }[]; };
  handoffsByReason: { reason: string; count: number }[];
  leadPipeline: { total: number; averageScore: number; byStatus: Record<string, number>; byProjectType: Record<string, number>; scoreDistribution: { range: string; count: number }[] };
}

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  try {
  const [
    conversations, handoffs, quotes, appointments, contacts,
    recentActivity, pipelineTotal, trends, handoffReasons, leadPipeline
  ] = await Promise.all([
    query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM conversations WHERE business_id = $1 GROUP BY status`, [tenantId]),
    query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM handoffs WHERE business_id = $1 GROUP BY status`, [tenantId]),
    query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM quotes WHERE business_id = $1 GROUP BY status`, [tenantId]),
    query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM appointments WHERE business_id = $1 GROUP BY status`, [tenantId]),
    query<{ status: string; count: string }>(`SELECT status, COUNT(*) as count FROM contacts WHERE business_id = $1 GROUP BY status`, [tenantId]),
    Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) as count FROM conversations WHERE business_id = $1 AND started_at >= NOW() - INTERVAL '24 hours'`, [tenantId]),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.business_id = $1 AND m.created_at >= NOW() - INTERVAL '24 hours'`, [tenantId]),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM handoffs WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`, [tenantId]),
    ]),
    query<{ count: string; total: string }>(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM quotes WHERE business_id = $1`, [tenantId]),
    Promise.all([
      query<{ date: string; count: string }>(`SELECT DATE(created_at) as date, COUNT(*) as count FROM conversations WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date`, [tenantId]),
      query<{ date: string; count: string }>(`SELECT DATE(m.created_at) as date, COUNT(*) as count FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.business_id = $1 AND m.created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(m.created_at) ORDER BY date`, [tenantId]),
    ]),
    query<{ reason: string; count: string }>(`SELECT COALESCE(reason, 'Unspecified') as reason, COUNT(*) as count FROM handoffs WHERE business_id = $1 GROUP BY reason ORDER BY count DESC`, [tenantId]),
    (async () => {
      try {
        const { getLeadPipelineSummary } = await import('./leadScore.service');
        return getLeadPipelineSummary(tenantId);
      } catch {
        return { total: 0, averageScore: 0, byStatus: {}, byProjectType: {}, scoreDistribution: [] };
      }
    })(),
  ]);

    const mapStatus = (rows: { status: string; count: string }[]) => {
      const map: Record<string, number> = {};
      rows.forEach((row) => { map[row.status] = parseInt(row.count, 10); });
      return map;
    };

    const cs = mapStatus(conversations.rows);
    const hs = mapStatus(handoffs.rows);
    const qs = mapStatus(quotes.rows);
    const as2 = mapStatus(appointments.rows);
    const cos = mapStatus(contacts.rows);
    const totalQuotes = pipelineTotal.rows[0] ? parseInt(pipelineTotal.rows[0].count, 10) : 0;
    const acceptedQuotes = qs['accepted'] || 0;

    return {
      conversations: { total: Object.values(cs).reduce((a, b) => a + b, 0), active: cs['active'] || 0, waitingAgent: cs['waiting_agent'] || 0, waitingCustomer: cs['waiting_customer'] || 0, closed: cs['closed'] || 0, archived: cs['archived'] || 0 },
      handoffs: { total: Object.values(hs).reduce((a, b) => a + b, 0), pending: hs['pending'] || 0, accepted: hs['accepted'] || 0, completed: hs['completed'] || 0, cancelled: hs['cancelled'] || 0 },
      quotes: { total: Object.values(qs).reduce((a, b) => a + b, 0), draft: qs['draft'] || 0, sent: qs['sent'] || 0, accepted: acceptedQuotes, rejected: qs['rejected'] || 0, expired: qs['expired'] || 0 },
      appointments: { total: Object.values(as2).reduce((a, b) => a + b, 0), scheduled: as2['scheduled'] || 0, confirmed: as2['confirmed'] || 0, completed: as2['completed'] || 0, cancelled: as2['cancelled'] || 0, noShow: as2['no_show'] || 0 },
      contacts: { total: Object.values(cos).reduce((a, b) => a + b, 0), active: cos['active'] || 0, blocked: cos['blocked'] || 0, archived: cos['archived'] || 0 },
      recentActivity: { conversationsLast24h: parseInt(recentActivity[0].rows[0]?.count || '0', 10), messagesLast24h: parseInt(recentActivity[1].rows[0]?.count || '0', 10), handoffsLast24h: parseInt(recentActivity[2].rows[0]?.count || '0', 10) },
      pipeline: { totalQuotes, draft: qs['draft'] || 0, sent: qs['sent'] || 0, accepted: acceptedQuotes, rejected: qs['rejected'] || 0, conversionRate: totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0, totalValue: pipelineTotal.rows[0] ? parseFloat(pipelineTotal.rows[0].total) : 0 },
      trends: { conversationsByDay: trends[0].rows.map(r => ({ date: r.date, count: parseInt(r.count, 10) })), messagesByDay: trends[1].rows.map(r => ({ date: r.date, count: parseInt(r.count, 10) })) },
      handoffsByReason: handoffReasons.rows.map(r => ({ reason: r.reason, count: parseInt(r.count, 10) })),
      leadPipeline: {
        total: leadPipeline.total,
        averageScore: leadPipeline.averageScore,
        byStatus: leadPipeline.byStatus,
        byProjectType: leadPipeline.byProjectType,
        scoreDistribution: leadPipeline.scoreDistribution,
      },
    };
  } catch (error) {
    logger.error('Failed to fetch dashboard stats', { error });
    throw error;
  }
}