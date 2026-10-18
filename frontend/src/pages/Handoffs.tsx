import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getHandoffs, updateHandoff, assignHandoff, getStaffUsers } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export function HandoffsPage() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['handoffs', { status, search, page }],
    queryFn: () => {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (status) params.status = status
      return getHandoffs(params as any)
    },
  })

  const { data: staffData } = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => getStaffUsers({ page: 1, limit: 100 }),
  })

  const staff = (staffData as any)?.data || []

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: 'pending' | 'accepted' | 'completed' | 'cancelled' } }) => updateHandoff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] })
      toast.success('Handoff updated')
    },
    onError: () => toast.error('Failed to update handoff'),
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string }) => assignHandoff(id, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] })
      toast.success('Handoff assigned')
    },
    onError: () => toast.error('Failed to assign handoff'),
  })

  const handoffs = (data?.data || []).filter((h: any) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (h.contactName || '').toLowerCase().includes(q) || (h.contactPhone || '').toLowerCase().includes(q) || (h.reason || '').toLowerCase().includes(q)
  })

  if (error) {
    return <div className="card p-8"><ErrorState onRetry={() => refetch()} /></div>
  }

  const meta = (data as any)?.meta || data
  const totalPages = (meta as any)?.totalPages || 1
  const total = (meta as any)?.total || handoffs.length

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Human Handoffs"
        subtitle="Conversations that need a human response"
        actions={
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="input w-full sm:w-auto"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="w-full sm:w-64">
              <SearchInput value={search} onChange={setSearch} onClear={() => setSearch('')} placeholder="Search handoffs..." />
            </div>
          </div>
        }
      />

      {handoffs.some((h: any) => h.status === 'pending') && status === '' && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-warning-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-warning-800">
              {handoffs.filter((h: any) => h.status === 'pending').length} conversation{handoffs.filter((h: any) => h.status === 'pending').length !== 1 ? 's' : ''} need your attention
            </p>
            <p className="text-xs text-warning-600">These customers are waiting for a human response</p>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState type="skeleton" count={8} />
        ) : handoffs.length === 0 ? (
          <EmptyState icon={<NoDataIcon />} title="No handoffs" description="Handoffs appear here when the AI needs human help." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th scope="col" className="table-header">Customer</th>
                    <th scope="col" className="table-header">Reason</th>
                    <th scope="col" className="table-header">Requested By</th>
                    <th scope="col" className="table-header">Assigned To</th>
                    <th scope="col" className="table-header">Status</th>
                    <th scope="col" className="table-header hidden md:table-cell">Created</th>
                    <th scope="col" className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {handoffs.map((handoff: any) => (
                    <tr key={handoff.id} className="table-row">
                      <td className="table-cell">
                        <button
                          onClick={() => navigate(`/inbox/${handoff.conversation_id}`)}
                          className="text-left hover:text-primary-600 transition-colors"
                        >
                          <p className="text-sm font-medium text-surface-800">{handoff.contactName || handoff.contactPhone || 'Unknown'}</p>
                          <p className="text-xs text-surface-400">{handoff.contactPhone}</p>
                        </button>
                      </td>
                      <td className="table-cell text-sm text-surface-600 max-w-[260px]">
                        <p className="truncate">{handoff.reason}</p>
                        {handoff.notes && (
                          <p className="text-xs text-surface-400 truncate mt-0.5" title={handoff.notes}>
                            {handoff.notes}
                          </p>
                        )}
                      </td>
                      <td className="table-cell text-sm text-surface-600 capitalize">{handoff.requested_by}</td>
                      <td className="table-cell text-sm text-surface-600">
                        {handoff.assignedStaffName || (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) assignMutation.mutate({ id: handoff.id, staffId: e.target.value })
                            }}
                            disabled={assignMutation.isPending}
                            className="text-xs border border-surface-200 rounded px-1 py-0.5"
                          >
                            <option value="">Assign...</option>
                            {staff.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.display_name || s.email || s.id}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="table-cell"><StatusBadge status={handoff.status} type="handoff" /></td>
                      <td className="table-cell text-surface-400 text-xs hidden md:table-cell">
                        {new Date(handoff.created_at).toLocaleString()}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/inbox/${handoff.conversation_id}`)}
                            className="px-2.5 py-1 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                          >
                            Open
                          </button>
                          {handoff.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateMutation.mutate({ id: handoff.id, data: { status: 'accepted' } })}
                                disabled={updateMutation.isPending}
                                className="px-2.5 py-1 text-xs font-medium text-success-700 bg-success-50 hover:bg-success-100 rounded-md transition-colors disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => updateMutation.mutate({ id: handoff.id, data: { status: 'completed' } })}
                                disabled={updateMutation.isPending}
                                className="px-2.5 py-1 text-xs font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-md transition-colors disabled:opacity-50"
                              >
                                Resolve
                              </button>
                            </>
                          )}
                        </div>
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
    </div>
  )
}
