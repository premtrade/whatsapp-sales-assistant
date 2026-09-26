import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getOwnerDashboard, getFinancialMetrics } from '@/services/api'
import type { OwnerDashboardStats, FinancialMetrics } from '@/types'
import { useAuth } from '@/context/AuthContext'

export default function OwnerDashboardPage() {
  const [stats, setStats] = useState<OwnerDashboardStats | null>(null)
  const [financials, setFinancials] = useState<FinancialMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const { staff } = useAuth()

  useEffect(() => {
    async function load() {
      try {
        const [dashboardData, financialData] = await Promise.all([
          getOwnerDashboard(),
          getFinancialMetrics().catch(() => null),
        ])
        setStats(dashboardData)
        setFinancials(financialData)
      } catch {
        toast.error('Failed to load owner dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-surface-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center text-surface-500 py-12">
        <p>Failed to load dashboard.</p>
      </div>
    )
  }

  const formatCurrency = (value: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Platform Overview</h1>
        <p className="text-sm text-surface-400">Welcome back, {staff?.first_name || 'owner'}. Here's what's happening across WAFLO.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Businesses</p>
          <p className="text-2xl font-bold text-surface-100 mt-1">{stats.businesses.total}</p>
          <p className="text-xs text-surface-400 mt-1">{stats.businesses.active} active · {stats.businesses.trialing} trialing</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Subscriptions</p>
          <p className="text-2xl font-bold text-surface-100 mt-1">{stats.subscriptions.total}</p>
          <p className="text-xs text-surface-400 mt-1">{stats.subscriptions.active} active · {stats.subscriptions.past_due} past due</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">MRR</p>
          <p className="text-2xl font-bold text-surface-100 mt-1">{formatCurrency(stats.revenue.mrr, stats.revenue.currency)}</p>
          <p className="text-xs text-surface-400 mt-1">ARR: {formatCurrency(stats.revenue.arr, stats.revenue.currency)}</p>
        </div>
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Trials</p>
          <p className="text-2xl font-bold text-surface-100 mt-1">{stats.subscriptions.trialing}</p>
          <p className="text-xs text-warning-400 mt-1">{stats.trials.expiringIn7Days} expiring in 7 days</p>
        </div>
      </div>

      {financials && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Expired Subs</p>
            <p className="text-2xl font-bold text-surface-100 mt-1">{financials.subscriptions.expired}</p>
          </div>
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Trial Conversions</p>
            <p className="text-2xl font-bold text-surface-100 mt-1">{financials.conversions.trialToPaid}</p>
            <p className="text-xs text-surface-400 mt-1">{financials.conversions.trialConversionRate.toFixed(1)}% rate</p>
          </div>
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Churn (30d)</p>
            <p className="text-2xl font-bold text-surface-100 mt-1">{financials.churn.canceledLast30Days}</p>
            <p className="text-xs text-surface-400 mt-1">{financials.churn.churnRate.toFixed(2)}% rate</p>
          </div>
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">ARPU</p>
            <p className="text-2xl font-bold text-surface-100 mt-1">{formatCurrency(financials.revenue.byPlan.reduce((a, b) => a + b.mrr, 0) / (financials.subscriptions.active || 1), financials.revenue.currency)}</p>
          </div>
        </div>
      )}

      <div className="bg-surface-900 border border-surface-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-surface-100 mb-4">Recent Businesses</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-950 text-surface-400">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {stats.recentBusinesses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-surface-500">No businesses yet.</td>
                </tr>
              ) : (
                stats.recentBusinesses.map((biz) => (
                  <tr key={biz.id} className="hover:bg-surface-800/50">
                    <td className="px-4 py-3 text-surface-100 font-medium">{biz.name}</td>
                    <td className="px-4 py-3 text-surface-300">{biz.slug}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${biz.status === 'active' ? 'bg-success-500/10 text-success-400' : biz.status === 'trialing' ? 'bg-warning-500/10 text-warning-400' : 'bg-surface-800 text-surface-400'}`}>
                        {biz.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-surface-300">{new Date(biz.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
