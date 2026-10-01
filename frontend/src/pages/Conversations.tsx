import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConversations } from '@/services/api'
import { SearchInput } from '@/components/SearchInput/SearchInput'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'

export default function Conversations() {
  const [search, setSearch] = useState('')

  const { data: convs, isLoading: loading } = useQuery({
    queryKey: ['conversations', 'all'],
    queryFn: () => getConversations({ page: 1, limit: 100 }),
  })

  const conversations = convs?.data || []

  const filtered = search
    ? conversations.filter(c =>
        (c.contact?.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.contact?.phone || '').includes(search) ||
        (c.status || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations

  function exportCSV() {
    const rows = [['Contact', 'Phone', 'Status', 'Last Message', 'Channel']]
    filtered.forEach(c => {
      rows.push([
        c.contact?.display_name || '',
        c.contact?.phone || '',
        c.status || '',
        c.last_message_at ? new Date(c.last_message_at).toLocaleString() : '',
        c.channel || ''
      ])
    })
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversations_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="card p-8"><p className="text-surface-500">Loading conversations...</p></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-surface-100">Conversations</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <SearchInput value={search} onChange={setSearch} onClear={() => setSearch('')} placeholder="Search by name, phone, status..." />
          <button onClick={exportCSV} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-950 text-surface-400">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium">Contact</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Status</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Last Message</th>
                <th scope="col" className="text-left px-4 py-3 font-medium">Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState icon={<NoDataIcon />} title="No conversations found" description="Try adjusting your search or filters." />
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="hover:bg-surface-800/50">
                    <td className="px-4 py-3 text-surface-100 font-medium">{c.contact?.display_name || c.contact?.phone || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} type="conversation" /></td>
                    <td className="px-4 py-3 text-surface-300">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-surface-300">{c.channel || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
