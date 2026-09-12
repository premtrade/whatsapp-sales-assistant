import type { ReactNode } from 'react'

interface MetricCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
  onClick?: () => void
  className?: string
}

export function MetricCard({ title, value, icon, trend, onClick, className = '' }: MetricCardProps) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`card p-5 text-left transition-all duration-150 ${onClick ? 'hover:shadow-card-hover cursor-pointer active:scale-[0.98]' : ''} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-500 truncate">{title}</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-medium ${trend.positive ? 'text-success-600' : 'text-danger-600'}`}>
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-surface-400">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600 shrink-0 ml-4">
            {icon}
          </div>
        )}
      </div>
    </Component>
  )
}
