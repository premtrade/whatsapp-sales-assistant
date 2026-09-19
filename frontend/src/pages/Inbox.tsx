import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConversations } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { useNavigate, useParams } from 'react-router-dom'
import { SearchInput } from '@/components/SearchInput/SearchInput'

const filters = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'waiting_agent', label: 'Waiting' },
  { id: 'waiting_customer', label: 'Waiting Customer' },
  { id: 'closed', label: 'Closed' },
]

export function InboxPage() {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['conversations', { search, status: activeFilter }],
    queryFn: () => getConversations({ page: 1, limit: 50, search, status: activeFilter || undefined }),
  })

  const conversations = data?.data || []

  if (error) {
    return <div className="p-8"><ErrorState onRetry={() => refetch()} /></div>
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900">Inbox</h1>
          <p className="text-sm text-surface-500 mt-0.5">Manage customer conversations</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex h-[calc(100dvh-13rem)] sm:h-[calc(100vh-12rem)]">
          {/* Left: Conversation List */}
          <div className="w-full sm:max-w-sm sm:border-r border-surface-200 flex flex-col min-w-0">
            {/* Search & Filters */}
            <div className="p-3 border-b border-surface-100 space-y-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                onClear={() => setSearch('')}
                placeholder="Search conversations..."
              />
              <div className="flex gap-1 overflow-x-auto scrollbar-thin">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                      activeFilter === f.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {isLoading ? (
                <LoadingState type="skeleton" count={8} />
              ) : conversations.length === 0 ? (
                <EmptyState icon={<NoDataIcon />} title="No conversations" description="Try adjusting your search or filters." />
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => navigate(`/inbox/${conv.id}`)}
                    className="touch-target w-full px-4 py-3 flex items-start gap-3 hover:bg-surface-50 active:bg-surface-100 transition-colors text-left border-b border-surface-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-semibold shrink-0">
                      {conv.contact?.display_name?.charAt(0) || conv.contact?.phone?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-surface-800 truncate">
                          {conv.contact?.display_name || conv.contact?.phone || 'Unknown'}
                        </p>
                        <span className="text-[10px] text-surface-400 shrink-0">
                          {conv.last_message_at ? formatTime(conv.last_message_at) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-surface-400 truncate mt-0.5">
                        {conv.contact?.phone}
                      </p>
                      <div className="mt-1.5">
                        <StatusBadge status={conv.status} type="conversation" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Empty state for no selected conversation */}
          <div className="flex-1 min-h-[180px] hidden sm:flex items-center justify-center bg-surface-50">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-surface-100 flex items-center justify-center text-surface-400 mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-surface-500">Select a conversation</p>
              <p className="text-xs text-surface-400 mt-1">Choose from the list to view messages</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
