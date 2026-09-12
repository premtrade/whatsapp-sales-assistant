import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardStats } from '@/services/api'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { MetricCard } from '@/components/MetricCard/MetricCard'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const dateRanges = [
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '90', label: '90 Days' },
]

export function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics', dateRange],
    queryFn: getDashboardStats,
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Analytics"
        subtitle="Sales and conversation metrics"
        actions={
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
            {dateRanges.map((range) => (
              <button
                key={range.id}
                onClick={() => setDateRange(range.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dateRange === range.id ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <LoadingState type="card" count={4} />
      ) : stats ? (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Conversations"
              value={stats.conversations.total}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
            />
            <MetricCard
              title="Messages (24h)"
              value={stats.recentActivity.messagesLast24h}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              }
            />
            <MetricCard
              title="Conversion Rate"
              value={`${stats.pipeline.conversionRate}%`}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
            <MetricCard
              title="Pipeline Value"
              value={`JMD ${stats.pipeline.totalValue?.toLocaleString()}`}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversation Volume</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.trends.conversationsByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="count" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Handoffs by Reason</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.handoffsByReason} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis dataKey="reason" type="category" width={120} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown tables */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversation Status</h3>
              <div className="space-y-2">
                {[
                  { label: 'Active', value: stats.conversations.active },
                  { label: 'Waiting (Agent)', value: stats.conversations.waitingAgent },
                  { label: 'Waiting (Customer)', value: stats.conversations.waitingCustomer },
                  { label: 'Closed', value: stats.conversations.closed },
                  { label: 'Archived', value: stats.conversations.archived },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-surface-600">{item.label}</span>
                    <span className="text-sm font-semibold text-surface-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Recent Activity (24h)</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-surface-600">New Conversations</span>
                  <span className="text-sm font-semibold text-surface-800">{stats.recentActivity.conversationsLast24h}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-surface-600">Messages Sent</span>
                  <span className="text-sm font-semibold text-surface-800">{stats.recentActivity.messagesLast24h}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-surface-600">Handoffs Created</span>
                  <span className="text-sm font-semibold text-surface-800">{stats.recentActivity.handoffsLast24h}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
