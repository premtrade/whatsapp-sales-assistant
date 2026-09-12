import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '@/services/api'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { DataTable } from '@/components/DataTable/DataTable'
import { useState } from 'react'

export function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { entityType, action, search }],
    queryFn: () =>
      getAuditLogs({
        page: 1,
        limit: 20,
        entity_type: entityType || undefined,
        action: action || undefined,
        search,
      }),
  })

  const logs = data?.data || []

  const columns = [
    {
      key: 'entity_type',
      label: 'Entity',
      render: (value: unknown) => (
        <span className="capitalize">{String(value)}</span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (value: unknown) => (
        <span className="capitalize">{String(value)}</span>
      ),
    },
    {
      key: 'performed_by_type',
      label: 'By Type',
      render: (value: unknown) => (
        <span className="capitalize">{String(value)}</span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (value: unknown) => String(value || '-'),
    },
    {
      key: 'created_at',
      label: 'Timestamp',
      render: (value: unknown) => new Date(value as string).toLocaleString(),
    },
  ]

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Entities</option>
            <option value="contacts">Contacts</option>
            <option value="conversations">Conversations</option>
            <option value="messages">Messages</option>
            <option value="quotes">Quotes</option>
            <option value="appointments">Appointments</option>
            <option value="handoffs">Handoffs</option>
            <option value="knowledge_documents">Knowledge</option>
            <option value="staff_users">Staff</option>
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="send">Send</option>
            <option value="receive">Receive</option>
          </select>
          <SearchInput
            value={search}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Search logs..."
          />
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <DataTable
          data={logs}
          columns={columns}
          loading={isLoading}
          keyExtractor={(row) => row.id}
          emptyMessage="No audit logs found"
        />
      </div>
    </div>
  )
}
