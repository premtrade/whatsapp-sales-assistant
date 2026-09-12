import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({ className = '', variant = 'rectangular', width, height }: SkeletonProps) {
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  }

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : '100px'),
  }

  return (
    <div
      className={`animate-pulse bg-gray-200 ${variantClasses[variant]} ${className}`}
      style={style}
    />
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="px-6 py-4 border-b border-gray-200">
        <Skeleton height={20} width={200} className="mb-2" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="px-6 py-4 border-b border-gray-100 flex items-center space-x-4">
          <Skeleton height={40} width={40} variant="circular" />
          <div className="flex-1">
            <Skeleton height={16} width="60%" className="mb-2" />
            <Skeleton height={12} width="40%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white overflow-hidden shadow rounded-lg animate-pulse">
          <div className="p-5">
            <Skeleton height={12} width="40%" className="mb-2" />
            <Skeleton height={24} width="60%" />
          </div>
        </div>
      ))}
    </div>
  )
}
