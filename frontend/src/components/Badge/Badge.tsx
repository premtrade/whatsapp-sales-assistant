import type { ReactNode } from 'react'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'gray' | 'primary'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-50 text-success-700 ring-1 ring-success-600/20',
  warning: 'bg-warning-50 text-warning-700 ring-1 ring-warning-600/20',
  danger: 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20',
  info: 'bg-info-50 text-info-700 ring-1 ring-info-600/20',
  gray: 'bg-surface-100 text-surface-600 ring-1 ring-surface-500/20',
  primary: 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20',
}

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  gray: 'bg-surface-400',
  primary: 'bg-primary-500',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export function Badge({ children, variant = 'gray', size = 'sm', dot = false, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  )
}
