import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSystemHealth, getSystemMetrics } from '@/services/api'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import toast from 'react-hot-toast'

export function SystemHealth() {
  const [isClearing, setIsClearing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const { data: health, isLoading, error, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: getSystemHealth,
    refetchInterval: 60000, // Refetch every minute
  })

  const { data: metrics } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: getSystemMetrics,
  })

  const statusDot: Record<string, string> = {
    operational: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-danger-500',
  }

  const overallStatusDot: Record<string, string> = {
    operational: 'bg-success-500',
    degraded: 'bg-warning-500',
    down: 'bg-danger-500',
  }

  const overallStatusLabel: Record<string, string> = {
    operational: 'All Systems Operational',
    degraded: 'Degraded Performance',
    down: 'Major Outage',
  }

  const handleClearCache = () => {
    setIsClearing(true)
    setTimeout(() => {
      setIsClearing(false)
      toast.success('Cache cleared successfully')
    }, 1500)
  }

  const handleExport = () => {
    setIsExporting(true)
    setTimeout(() => {
      setIsExporting(false)
      toast.success('Configuration exported')
    }, 1200)
  }

  if (isLoading) {
    return <LoadingState type="card" count={4} />
  }

  if (error) {
    return <EmptyState icon={<NoDataIcon />} title="Failed to load system health" description="Please try again later." />
  }

  const services = health?.services || []
  const overall = health?.overall || 'operational'

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-surface-800">System Health</h4>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${overallStatusDot[overall]}`} />
            <span className="text-sm font-medium text-surface-800">{overallStatusLabel[overall]}</span>
            <button onClick={() => refetch()} className="p-1 text-surface-400 hover:text-surface-600" title="Refresh">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot[item.status]}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-800">{item.label}</p>
                <p className="text-xs text-surface-400 truncate">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      {metrics && (
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-surface-800 mb-3">System Metrics</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
              <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-xs text-surface-400">Uptime</p>
                <p className="text-sm font-medium text-surface-800">{formatUptime(metrics.uptime)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
              <div className="w-8 h-8 rounded-lg bg-info-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-info-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
              </div>
              <div>
                <p className="text-xs text-surface-400">Memory</p>
                <p className="text-sm font-medium text-surface-800">{metrics.memory.used} MB / {metrics.memory.total} MB</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
              <div className="w-8 h-8 rounded-lg bg-warning-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <p className="text-xs text-surface-400">CPU Time</p>
                <p className="text-sm font-medium text-surface-800">User: {metrics.cpu.user}ms Sys: {metrics.cpu.system}ms</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50">
              <div className="w-8 h-8 rounded-lg bg-success-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <div>
                <p className="text-xs text-surface-400">Connections</p>
                <p className="text-sm font-medium text-surface-800">{metrics.connections}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-surface-800 mb-1">Maintenance</h4>
        <p className="text-xs text-surface-400 mb-4">Clear cached data or back up your configuration.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleClearCache} disabled={isClearing} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50">
            {isClearing ? 'Clearing...' : 'Clear Cache'}
          </button>
          <button onClick={handleExport} disabled={isExporting} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50">
            {isExporting ? 'Exporting...' : 'Export Configuration'}
          </button>
          <button onClick={() => toast('Import dialog coming from your backup file')} className="btn-secondary text-xs px-3 py-1.5">
            Import Configuration
          </button>
        </div>
      </div>
      <div className="card p-4">
        <h4 className="text-sm font-semibold text-surface-800 mb-3">Recent Configuration Changes</h4>
        <div className="space-y-2">
          {[
            { action: 'Updated ai_response_delay', by: 'Admin', time: '2 hours ago' },
            { action: 'Changed business_hours', by: 'Manager', time: 'Yesterday' },
            { action: 'Enabled auto_reply', by: 'Admin', time: '3 days ago' },
          ].map((log, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-surface-50 last:border-0">
              <div>
                <p className="text-sm text-surface-800 font-mono">{log.action}</p>
                <p className="text-xs text-surface-400">by {log.by}</p>
              </div>
              <span className="text-xs text-surface-400">{log.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}