import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getContacts } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { useNavigate } from 'react-router-dom'

export function CustomersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', { search, status }],
    queryFn: () => getContacts({ page: 1, limit: 50, search, status }),
  })

  const customers = data?.data || []

  if (error) {
    return <div className="card p-8"><LoadingState type="spinner" /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customers"
        subtitle="Manage your customer relationships"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input w-auto"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
              <option value="archived">Archived</option>
            </select>
            <div className="w-64">
              <SearchInput
                value={search}
                onChange={setSearch}
                onClear={() => setSearch('')}
                placeholder="Search customers..."
              />
            </div>
          </div>
        }
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState type="skeleton" count={8} />
        ) : customers.length === 0 ? (
          <EmptyState icon={<NoDataIcon />} title="No customers found" description="Customers will appear here when they message you on WhatsApp." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="table-header">Customer</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header hidden md:table-cell">Company</th>
                  <th className="table-header hidden lg:table-cell">Source</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    className="table-row cursor-pointer"
                  >
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold shrink-0">
                          {customer.display_name?.charAt(0) || '?'}
                        </div>
                        <span className="text-sm font-medium text-surface-800">{customer.display_name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="table-cell text-surface-600">{customer.phone}</td>
                    <td className="table-cell text-surface-600 hidden md:table-cell">{customer.company || '-'}</td>
                    <td className="table-cell text-surface-600 capitalize hidden lg:table-cell">{customer.source}</td>
                    <td className="table-cell"><StatusBadge status={customer.status} type="contact" /></td>
                    <td className="table-cell text-surface-400 text-xs hidden sm:table-cell">
                      {customer.last_seen_at ? new Date(customer.last_seen_at).toLocaleDateString() : '-'}
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
