import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getQuotes } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Modal } from '@/components/Modal/Modal'
import type { Quote } from '@/types'

export function QuotesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['quotes', { search, status }],
    queryFn: () => getQuotes({ page: 1, limit: 50, status }),
  })

  const quotes = data?.data || []

  if (error) {
    return <div className="card p-8"><ErrorState onRetry={() => refetch()} /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Quotes"
        subtitle="Track and manage customer quotes"
        actions={
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                onClear={() => setSearch('')}
                placeholder="Search quotes..."
              />
            </div>
          </div>
        }
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState type="skeleton" count={8} />
        ) : quotes.length === 0 ? (
          <EmptyState icon={<NoDataIcon />} title="No quotes found" description="Quotes will appear here when created." />
        ) : (
          <div className="overflow-x-auto -mx-0">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="table-header">Quote #</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Total</th>
                  <th className="table-header hidden md:table-cell">Valid Until</th>
                  <th className="table-header hidden sm:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {quotes.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => setSelectedQuote(quote)}
                    className="table-row cursor-pointer"
                  >
                    <td className="table-cell font-medium text-surface-800">{quote.quote_number}</td>
                    <td className="table-cell">
                      <div>
                        <p className="text-sm font-medium text-surface-800">{quote.contact?.display_name || 'Unknown'}</p>
                        <p className="text-xs text-surface-400">{quote.contact?.phone}</p>
                      </div>
                    </td>
                    <td className="table-cell"><StatusBadge status={quote.status} type="quote" />
                      {quote.requires_review && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded-full">
                          Pending review
                        </span>
                      )}
                    </td>
                    <td className="table-cell font-medium text-surface-800">
                      {quote.currency} {quote.total?.toLocaleString()}
                    </td>
                    <td className="table-cell text-surface-400 text-xs hidden md:table-cell">
                      {quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : '-'}
                    </td>
                    <td className="table-cell text-surface-400 text-xs hidden sm:table-cell">
                      {new Date(quote.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedQuote && (
        <Modal isOpen={!!selectedQuote} onClose={() => setSelectedQuote(null)} title={`Quote ${selectedQuote.quote_number}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-surface-400">Customer</p>
                <p className="text-sm text-surface-800">{selectedQuote.contact?.display_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Status</p>
                <StatusBadge status={selectedQuote.status} type="quote" />
                {selectedQuote.requires_review && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] font-medium text-warning-700 bg-warning-50 border border-warning-200 rounded-full">
                    Pending review
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Subtotal</p>
                <p className="text-sm text-surface-800">{selectedQuote.currency} {selectedQuote.subtotal?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Tax</p>
                <p className="text-sm text-surface-800">{selectedQuote.currency} {selectedQuote.tax?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Discount</p>
                <p className="text-sm text-surface-800">{selectedQuote.currency} {selectedQuote.discount?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Total</p>
                <p className="text-lg font-bold text-surface-800">{selectedQuote.currency} {selectedQuote.total?.toLocaleString()}</p>
              </div>
              {selectedQuote.valid_until && (
                <div>
                  <p className="text-xs font-medium text-surface-400">Valid Until</p>
                  <p className="text-sm text-surface-800">{new Date(selectedQuote.valid_until).toLocaleDateString()}</p>
                </div>
              )}
            </div>
            {selectedQuote.notes && (
              <div className="pt-4 border-t border-surface-100">
                <p className="text-xs font-medium text-surface-400 mb-1">Notes</p>
                <p className="text-sm text-surface-700">{selectedQuote.notes}</p>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4">
              <button onClick={() => setSelectedQuote(null)} className="btn-secondary touch-target w-full sm:w-auto">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
