import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getQuotes, updateQuote, getQuoteItems } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Modal } from '@/components/Modal/Modal'
import toast from 'react-hot-toast'
import type { Quote, QuoteItem } from '@/types'

export function QuotesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['quotes', { search, status, page }],
    queryFn: () => {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (status) params.status = status
      if (search.trim()) params.search = search.trim()
      return getQuotes(params as any)
    },
  })

  const quotes = data?.data || []
  const meta = (data as any)?.meta || data
  const totalPages = (meta as any)?.totalPages || 1
  const total = (meta as any)?.total || quotes.length

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateQuote(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Quote updated')
    },
    onError: () => toast.error('Failed to update quote'),
  })

  const { data: itemsData } = useQuery({
    queryKey: ['quote-items', selectedQuote?.id],
    queryFn: () => getQuoteItems(selectedQuote!.id),
    enabled: !!selectedQuote,
  })
  const items: QuoteItem[] = (itemsData as any) || []

  const transition = (q: Quote, newStatus: string) => {
    updateMutation.mutate({ id: q.id, data: { status: newStatus } })
    setSelectedQuote({ ...q, status: newStatus as Quote['status'] })
  }

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
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
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
                onChange={(v) => { setSearch(v); setPage(1) }}
                onClear={() => { setSearch(''); setPage(1) }}
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
          <>
            <div className="overflow-x-auto -mx-0">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th scope="col" className="table-header">Quote #</th>
                    <th scope="col" className="table-header">Customer</th>
                    <th scope="col" className="table-header">Status</th>
                    <th scope="col" className="table-header">Total</th>
                    <th scope="col" className="table-header hidden md:table-cell">Valid Until</th>
                    <th scope="col" className="table-header hidden sm:table-cell">Created</th>
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
                          <p className="text-sm font-medium text-surface-800">{quote.contact?.display_name || quote.contact?.phone || 'Unknown'}</p>
                          <p className="text-xs text-surface-400">{quote.contact?.phone}</p>
                        </div>
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={quote.status} type="quote" />
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100">
              <p className="text-xs text-surface-400">{total} total</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-surface-200 disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-xs text-surface-500">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-surface-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedQuote && (
        <Modal isOpen={!!selectedQuote} onClose={() => setSelectedQuote(null)} title={`Quote ${selectedQuote.quote_number}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-surface-400">Customer</p>
                <p className="text-sm text-surface-800">{selectedQuote.contact?.display_name || selectedQuote.contact?.phone || 'Unknown'}</p>
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
            {items.length > 0 && (
              <div className="pt-4 border-t border-surface-100">
                <p className="text-xs font-medium text-surface-400 mb-2">Line Items</p>
                <div className="space-y-1">
                  {items.map((it) => (
                    <div key={it.id} className="flex justify-between text-sm">
                      <span className="text-surface-700">{it.description || it.product_id} × {it.quantity}</span>
                      <span className="text-surface-800 font-medium">{selectedQuote.currency} {it.line_total?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-4">
              {selectedQuote.status === 'draft' && (
                <button
                  onClick={() => transition(selectedQuote, 'sent')}
                  disabled={updateMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md disabled:opacity-50"
                >
                  Mark Sent
                </button>
              )}
              {selectedQuote.status === 'sent' && (
                <>
                  <button
                    onClick={() => transition(selectedQuote, 'accepted')}
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-success-700 bg-success-50 hover:bg-success-100 rounded-md disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => transition(selectedQuote, 'rejected')}
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-danger-700 bg-danger-50 hover:bg-danger-100 rounded-md disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {!['cancelled', 'accepted', 'rejected'].includes(selectedQuote.status) && (
                <button
                  onClick={() => transition(selectedQuote, 'cancelled')}
                  disabled={updateMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-md disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button onClick={() => setSelectedQuote(null)} className="btn-secondary touch-target w-full sm:w-auto ml-auto">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

