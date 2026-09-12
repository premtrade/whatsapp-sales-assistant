import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConversations } from '@/services/api'

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
    <div>
      <div className="page-header">
        <h1>Conversations</h1>
        <div className="page-controls">
          <input
            type="text"
            placeholder="Search by name, phone, status..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
          />
          <button onClick={exportCSV} className="btn-export">Export CSV</button>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Contact</th><th>Status</th><th>Last Message</th><th>Channel</th></tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.id}>
              <td>{c.contact?.display_name || c.contact?.phone}</td>
              <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
              <td>{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : '-'}</td>
              <td>{c.channel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="empty-state">No conversations found</p>}
    </div>
  )
}
