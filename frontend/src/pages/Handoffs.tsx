import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getHandoffs, updateHandoff } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export function HandoffsPage() {
  const [status, setStatus] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['handoffs', { status }],
    queryFn: () => getHandoffs({ page: 1, limit: 50, status }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: 'pending' | 'accepted' | 'completed' | 'cancelled' } }) => updateHandoff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] })
      toast.success('Handoff updated')
    },
    onError: () => toast.error('Failed to update handoff'),
  })

  const handoffs = data?.data || []

  if (error) {
    return <div className="card p-8"><ErrorState onRetry={() => refetch()} /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Human Handoffs"
        subtitle="Conversations that need a human response"
        actions={
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input w-auto"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        }
      />

      {handoffs.some((h) => h.status === 'pending') && status === '' && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-warning-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-warning-800">
              {handoffs.filter((h) => h.status === 'pending').length} conversation{handoffs.filter((h) => h.status === 'pending').length !== 1 ? 's' : ''} need your attention
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="table-header">Customer</th>
                  <th className="table-header">Reason</th>
                  <th className="table-header">Requested By</th>
                  <th className="table-header">Assigned To</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden md:table-cell">Created</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {handoffs.map((handoff) => (
                  <tr key={handoff.id} className="table-row">
                    <td className="table-cell">
                      <button
                        onClick={() => navigate(`/inbox/${handoff.conversation_id}`)}
                        className="text-left hover:text-primary-600 transition-colors"
                      >
                        <p className="text-sm font-medium text-surface-800">{handoff.contactName || 'Unknown'}</p>
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
                        <span className="px-2 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-100 border border-surface-200 rounded-full">
                          Unassigned
                        </span>
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
                              className="px-2.5 py-1 text-xs font-medium text-success-700 bg-success-50 hover:bg-success-100 rounded-md transition-colors"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => updateMutation.mutate({ id: handoff.id, data: { status: 'completed' } })}
                              className="px-2.5 py-1 text-xs font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-md transition-colors"
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
        )}
      </div>
    </div>
  )
}
