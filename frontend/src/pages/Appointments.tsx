import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAppointments } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { Modal } from '@/components/Modal/Modal'
import type { Appointment } from '@/types'

export function AppointmentsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['appointments', { search, status }],
    queryFn: () => getAppointments({ page: 1, limit: 50, status }),
  })

  const appointments = data?.data || []

  if (error) {
    return <div className="card p-8"><ErrorState onRetry={() => refetch()} /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Appointments"
        subtitle="Manage customer appointments"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input w-auto"
            >
              <option value="">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
            <div className="w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                onClear={() => setSearch('')}
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="table-header">Title</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Start</th>
                  <th className="table-header hidden md:table-cell">End</th>
                  <th className="table-header hidden lg:table-cell">Location</th>
                  <th className="table-header">Status</th>
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
                      <p className="text-sm text-surface-800">{apt.contact?.display_name || 'Unknown'}</p>
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
                <p className="text-sm text-surface-800">{selectedAppointment.contact?.display_name || 'Unknown'}</p>
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
            <div className="flex justify-end pt-4">
              <button onClick={() => setSelectedAppointment(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
