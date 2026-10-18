import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAppointments, updateAppointment } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Modal } from '@/components/Modal/Modal'
import toast from 'react-hot-toast'
import type { Appointment } from '@/types'

export function AppointmentsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['appointments', { search, status, type, page }],
    queryFn: () => {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (status) params.status = status
      if (type) params.appointment_type = type
      if (search.trim()) params.search = search.trim()
      return getAppointments(params as any)
    },
  })

  const appointments = data?.data || []
  const meta = (data as any)?.meta || data
  const totalPages = (meta as any)?.totalPages || 1
  const total = (meta as any)?.total || appointments.length

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateAppointment(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      toast.success('Appointment updated')
    },
    onError: () => toast.error('Failed to update appointment'),
  })

  const transition = (apt: Appointment, newStatus: string) => {
    updateMutation.mutate({ id: apt.id, data: { status: newStatus } })
    setSelectedAppointment({ ...apt, status: newStatus as Appointment['status'] })
  }

  if (error) {
    return <div className="card p-8"><ErrorState onRetry={() => refetch()} /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Appointments"
        subtitle="Manage customer appointments"
        actions={
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="input w-full sm:w-auto"
            >
              <option value="">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1) }}
              className="input w-full sm:w-auto"
            >
              <option value="">All Types</option>
              <option value="consultation">Consultation</option>
              <option value="site_visit">Site Visit</option>
              <option value="installation">Installation</option>
              <option value="follow_up">Follow Up</option>
              <option value="delivery">Delivery</option>
              <option value="other">Other</option>
            </select>
            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); setPage(1) }}
                onClear={() => { setSearch(''); setPage(1) }}
                placeholder="Search appointments..."
              />
            </div>
          </div>
        }
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState type="skeleton" count={8} />
        ) : appointments.length === 0 ? (
          <EmptyState icon={<NoDataIcon />} title="No appointments found" description="Appointments will appear here when scheduled." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th scope="col" className="table-header">Title</th>
                    <th scope="col" className="table-header">Customer</th>
                    <th scope="col" className="table-header">Start</th>
                    <th scope="col" className="table-header hidden md:table-cell">End</th>
                    <th scope="col" className="table-header hidden lg:table-cell">Location</th>
                    <th scope="col" className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {appointments.map((apt) => (
                    <tr
                      key={apt.id}
                      onClick={() => setSelectedAppointment(apt)}
                      className="table-row cursor-pointer"
                    >
                      <td className="table-cell">
                        <p className="text-sm font-medium text-surface-800">{apt.title}</p>
                        <p className="text-xs text-surface-400 capitalize">{apt.appointment_type?.replace('_', ' ')}</p>
                      </td>
                      <td className="table-cell">
                        <p className="text-sm text-surface-800">{apt.contact?.display_name || apt.contact?.phone || 'Unknown'}</p>
                        <p className="text-xs text-surface-400">{apt.contact?.phone}</p>
                      </td>
                      <td className="table-cell text-sm text-surface-600">
                        {new Date(apt.starts_at).toLocaleString()}
                      </td>
                      <td className="table-cell text-sm text-surface-600 hidden md:table-cell">
                        {new Date(apt.ends_at).toLocaleString()}
                      </td>
                      <td className="table-cell text-sm text-surface-600 hidden lg:table-cell">{apt.location || '-'}</td>
                      <td className="table-cell"><StatusBadge status={apt.status} type="appointment" /></td>
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

      {selectedAppointment && (
        <Modal isOpen={!!selectedAppointment} onClose={() => setSelectedAppointment(null)} title="Appointment Details">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-surface-400">Title</p>
                <p className="text-sm text-surface-800">{selectedAppointment.title}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Type</p>
                <p className="text-sm text-surface-800 capitalize">{selectedAppointment.appointment_type?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Start</p>
                <p className="text-sm text-surface-800">{new Date(selectedAppointment.starts_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">End</p>
                <p className="text-sm text-surface-800">{new Date(selectedAppointment.ends_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Customer</p>
                <p className="text-sm text-surface-800">{selectedAppointment.contact?.display_name || selectedAppointment.contact?.phone || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-surface-400">Status</p>
                <StatusBadge status={selectedAppointment.status} type="appointment" />
              </div>
              {selectedAppointment.location && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-surface-400">Location</p>
                  <p className="text-sm text-surface-800">{selectedAppointment.location}</p>
                </div>
              )}
              {selectedAppointment.description && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-surface-400">Description</p>
                  <p className="text-sm text-surface-700">{selectedAppointment.description}</p>
                </div>
              )}
              {selectedAppointment.assigned_to && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-surface-400">Assigned Staff ID</p>
                  <p className="text-xs text-surface-600 font-mono">{selectedAppointment.assigned_to}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-4">
              {selectedAppointment.status === 'scheduled' && (
                <button
                  onClick={() => transition(selectedAppointment, 'confirmed')}
                  disabled={updateMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md disabled:opacity-50"
                >
                  Confirm
                </button>
              )}
              {['scheduled', 'confirmed'].includes(selectedAppointment.status) && (
                <>
                  <button
                    onClick={() => transition(selectedAppointment, 'completed')}
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-success-700 bg-success-50 hover:bg-success-100 rounded-md disabled:opacity-50"
                  >
                    Complete
                  </button>
                  <button
                    onClick={() => transition(selectedAppointment, 'no_show')}
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-warning-700 bg-warning-50 hover:bg-warning-100 rounded-md disabled:opacity-50"
                  >
                    No Show
                  </button>
                  <button
                    onClick={() => transition(selectedAppointment, 'cancelled')}
                    disabled={updateMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-md disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button onClick={() => setSelectedAppointment(null)} className="btn-secondary touch-target w-full sm:w-auto ml-auto">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

