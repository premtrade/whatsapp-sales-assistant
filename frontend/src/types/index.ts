export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
  totalPages: number
  meta?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  meta?: PaginatedResponse<unknown>
  message?: string
  error?: string
}

export interface ApiError {
  message: string
  code?: string
  status?: number
}

export interface DateRange {
  start: string
  end: string
}

export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  field: string
  direction: SortDirection
}

export interface ColumnDef<T> {
  key: string
  label: string
  render?: (value: unknown, row: T) => React.ReactNode
}

export * from './auth'
export * from './contact'
export * from './conversation'
export * from './contact'
export * from './message'
export * from './handoff'
export * from './quote'
export * from './appointment'
export * from './knowledge'
export * from './audit'
export * from './settings'
export * from './lead'
export * from './note'
export * from './system'
export * from './public'
export * from './subscription'
