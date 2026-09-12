import type { DateRange } from '@/types'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return ''
    return dateString.split('T')[0]
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="relative">
        <input
          type="date"
          value={formatDateForInput(value.start)}
          onChange={(e) => onChange({ ...value, start: e.target.value ? `${e.target.value}T00:00:00Z` : '' })}
          className="block w-full pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
        />
      </div>
      <span className="text-gray-500">to</span>
      <div className="relative">
        <input
          type="date"
          value={formatDateForInput(value.end)}
          onChange={(e) => onChange({ ...value, end: e.target.value ? `${e.target.value}T23:59:59Z` : '' })}
          className="block w-full pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
        />
      </div>
    </div>
  )
}
