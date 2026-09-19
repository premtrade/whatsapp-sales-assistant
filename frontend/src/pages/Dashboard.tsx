import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDashboardStats, getConversations } from '@/services/api'
import { MetricCard } from '@/components/MetricCard/MetricCard'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { ErrorState, LoadingState } from '@/components/ErrorState/ErrorState'
import { useNavigate } from 'react-router-dom'
import { useWebSocket } from '@/context/WebSocketContext'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useEffect } from 'react'

export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { subscribe } = useWebSocket()

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  })

  const { data: recentConversations } = useQuery({
    queryKey: ['conversations', 'recent'],
    queryFn: () => getConversations({ page: 1, limit: 5, status: 'active' }),
  })

  // Subscribe to real-time dashboard stats updates
  useEffect(() => {
    const unsubscribe = subscribe('dashboard_stats_updated', (msg) => {
      queryClient.setQueryData(['dashboard-stats'], msg.payload)
    })
    return unsubscribe
  }, [subscribe, queryClient])

  if (statsError) {
    return <ErrorState onRetry={refetchStats} />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your WhatsApp sales operation"
      />

      {/* KPI Cards */}
      {statsLoading ? (
        <LoadingState type="card" count={6} />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            className="p-4 sm:p-5"
            title="Active Conversations"
            value={stats.conversations.active}
            onClick={() => navigate('/inbox')}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          />
          <MetricCard
            title="Pending Handoffs"
            value={stats.handoffs.pending}
            onClick={() => navigate('/handoffs')}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a4 4 0 110-8 4 4 0 010 8z" />
              </svg>
            }
          />
          <MetricCard
            title="Quote Requests"
            value={stats.quotes.sent}
            onClick={() => navigate('/quotes')}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <MetricCard
            title="Appointments"
            value={stats.appointments.scheduled + stats.appointments.confirmed}
            onClick={() => navigate('/appointments')}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
          <MetricCard
            title="AI Conversations"
            value={stats.conversations.active - stats.handoffs.pending}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />
          <MetricCard
            title="New Customers"
            value={stats.contacts.active}
            onClick={() => navigate('/customers')}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            }
          />
        </div>
      ) : null}

      {/* Conversation Activity Chart */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversation Activity (30 days)</h3>
          {statsLoading ? (
            <div className="skeleton h-48 w-full" />
          ) : stats?.trends.conversationsByDay?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.trends.conversationsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="count" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={<NoDataIcon />} title="No activity data" description="Conversation trends will appear here." />
          )}
        </div>

        {/* Sales Pipeline */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Sales Pipeline</h3>
          {statsLoading ? (
            <div className="skeleton h-48 w-full" />
          ) : stats ? (
            <div className="space-y-3">
              {[
                { label: 'Draft Quotes', value: stats.quotes.draft, color: 'bg-surface-400' },
                { label: 'Sent Quotes', value: stats.quotes.sent, color: 'bg-info-500' },
                { label: 'Accepted', value: stats.quotes.accepted, color: 'bg-success-500' },
                { label: 'Rejected', value: stats.quotes.rejected, color: 'bg-danger-500' },
                { label: 'Expired', value: stats.quotes.expired, color: 'bg-warning-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                  <span className="text-sm text-surface-600 flex-1">{item.label}</span>
                  <span className="text-sm font-semibold text-surface-800">{item.value}</span>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-surface-100 flex items-center justify-between">
                <span className="text-sm font-medium text-surface-700">Conversion Rate</span>
                <span className="text-sm font-bold text-primary-600">{stats.pipeline.conversionRate}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="card">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-800">Recent Conversations</h3>
          <button onClick={() => navigate('/inbox')} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            View all
          </button>
        </div>
        {statsLoading ? (
          <LoadingState type="skeleton" count={5} />
        ) : recentConversations?.data?.length ? (
          <div className="divide-y divide-surface-100">
            {recentConversations.data.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/inbox/${conv.id}`)}
                className="w-full px-5 py-3 flex items-center gap-4 hover:bg-surface-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold shrink-0">
                  {conv.contact?.display_name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">
                    {conv.contact?.display_name || conv.contact?.phone || 'Unknown'}
                  </p>
                  <p className="text-xs text-surface-400 truncate">
                    {conv.contact?.phone}
                  </p>
                </div>
                <StatusBadge status={conv.status} type="conversation" />
                <span className="text-xs text-surface-400 shrink-0 hidden sm:block">
                  {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString() : '-'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={<NoDataIcon />} title="No recent conversations" description="New conversations will appear here." />
        )}
      </div>

      {/* Attention Required */}
      {(stats?.handoffs.pending ?? 0) > 0 && (
        <div className="card border-warning-200 bg-warning-50/30">
          <div className="px-5 py-4 border-b border-warning-200/50">
            <h3 className="text-sm font-semibold text-warning-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Attention Required
            </h3>
          </div>
          <div className="p-5">
            <p className="text-sm text-warning-700">
              {stats?.handoffs.pending} conversation{stats?.handoffs.pending !== 1 ? 's' : ''} waiting for human response.
            </p>
            <button
              onClick={() => navigate('/handoffs')}
              className="mt-3 text-sm font-medium text-warning-800 hover:text-warning-900 underline"
            >
              View handoffs
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
