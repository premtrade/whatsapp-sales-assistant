import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardStats } from '@/services/api'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function ConversionFunnelPage() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  })

  if (isLoading) {
    return <LoadingState type="spinner" />
  }

  const funnelData = [
    { name: 'Inquiries', value: stats?.conversations?.total || 0, fill: '#3b82f6' },
    { name: 'Engaged', value: stats?.conversations?.active || 0, fill: '#10b981' },
    { name: 'Qualified', value: stats?.handoffs?.pending || 0, fill: '#f59e0b' },
    { name: 'Quotes Sent', value: stats?.quotes?.sent || 0, fill: '#8b5cf6' },
    { name: 'Accepted', value: stats?.quotes?.accepted || 0, fill: '#ec599b' },
  ]

  const conversionData = [
    { name: 'Quote Acceptance', rate: stats?.pipeline?.conversionRate || 0 },
    { name: 'Handoff Resolution', rate: stats?.handoffs?.total ? Math.round((stats.handoffs.completed / stats.handoffs.total) * 100) : 0 },
    { name: 'Appointment Show', rate: stats?.appointments?.total ? Math.round(((stats.appointments.completed + stats.appointments.confirmed) / stats.appointments.total) * 100) : 0 },
  ]

  const handoffReasons = stats?.handoffsByReason || []

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Conversion Funnel Analytics"
        subtitle="Track lead conversion through your sales pipeline"
        actions={
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dateRange === range ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        }
      />

      {/* Funnel Overview */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversion Funnel</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Rates */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversion Rates</h3>
          <div className="space-y-4">
            {conversionData.map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-surface-600">{item.name}</span>
                  <span className="text-sm font-semibold text-surface-800">{item.rate}%</span>
                </div>
                <div className="w-full bg-surface-100 rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, item.rate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Handoff Reasons */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Handoff Reasons</h3>
          {handoffReasons.length === 0 ? (
            <p className="text-sm text-surface-400 text-center py-8">No handoff data available</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={handoffReasons}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="reason"
                  >
                    {handoffReasons.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Value */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Pipeline Value</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-surface-50 rounded-lg">
            <p className="text-xs text-surface-400 uppercase tracking-wide">Total Pipeline</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">
              ${stats?.pipeline?.totalValue?.toLocaleString() || 0}
            </p>
          </div>
          <div className="text-center p-4 bg-surface-50 rounded-lg">
            <p className="text-xs text-surface-400 uppercase tracking-wide">Draft Quotes</p>
            <p className="text-2xl font-bold text-surface-500 mt-1">{stats?.pipeline?.draft || 0}</p>
          </div>
          <div className="text-center p-4 bg-surface-50 rounded-lg">
            <p className="text-xs text-surface-400 uppercase tracking-wide">Sent Quotes</p>
            <p className="text-2xl font-bold text-info-600 mt-1">{stats?.pipeline?.sent || 0}</p>
          </div>
          <div className="text-center p-4 bg-surface-50 rounded-lg">
            <p className="text-xs text-surface-400 uppercase tracking-wide">Accepted</p>
            <p className="text-2xl font-bold text-success-600 mt-1">{stats?.pipeline?.accepted || 0}</p>
          </div>
        </div>
      </div>

      {/* Trends */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Conversation Trends</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.trends?.conversationsByDay || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}