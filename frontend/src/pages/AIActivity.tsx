import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConversations, getConversationMessages } from '@/services/api'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { Badge } from '@/components/Badge/Badge'

export function AIActivityPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['ai-activity', 'conversations'],
    queryFn: () => getConversations({ page: 1, limit: 20 }),
  })

  const { data: messagesData } = useQuery({
    queryKey: ['ai-activity', 'messages', selectedConversation],
    queryFn: () => getConversationMessages(selectedConversation!, { limit: 100 }),
    enabled: !!selectedConversation,
  })

  const aiMessages = messagesData?.data?.filter((m) => m.sender_type === 'ai') || []

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="AI Activity"
        subtitle="Monitor AI responses and understand how the assistant helps customers"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Conversation selector */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Conversations</h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin divide-y divide-surface-50">
            {isLoading ? (
              <LoadingState type="skeleton" count={6} />
            ) : conversations?.data?.length ? (
              conversations.data.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    selectedConversation === conv.id ? 'bg-primary-50' : 'hover:bg-surface-50'
                  }`}
                >
                  <p className="text-sm font-medium text-surface-800 truncate">
                    {conv.contact?.display_name || conv.contact?.phone || 'Unknown'}
                  </p>
                  <p className="text-xs text-surface-400">{conv.contact?.phone}</p>
                </button>
              ))
            ) : (
              <EmptyState icon={<NoDataIcon />} title="No conversations" />
            )}
          </div>
        </div>

        {/* AI Messages */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">AI Responses</h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-4 space-y-4">
            {!selectedConversation ? (
              <EmptyState
                title="Select a conversation"
                description="Choose a conversation to view AI responses"
              />
            ) : aiMessages.length === 0 ? (
              <EmptyState icon={<NoDataIcon />} title="No AI responses" />
            ) : (
              aiMessages.map((msg) => {
                const prevMsg = messagesData?.data?.find((m, i) => {
                  const msgIdx = messagesData.data.indexOf(msg)
                  return messagesData.data[i + 1]?.id === msg.id && m.direction === 'incoming'
                })
                return (
                  <div key={msg.id} className="border border-surface-100 rounded-xl p-4 space-y-3">
                    {prevMsg && (
                      <div className="pb-3 border-b border-surface-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge variant="gray" size="sm">Customer</Badge>
                          <span className="text-[10px] text-surface-400">
                            {new Date(prevMsg.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-surface-600">{prevMsg.text_body}</p>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="primary" size="sm">AI Response</Badge>
                        <span className="text-[10px] text-surface-400">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-surface-800 bg-primary-50 rounded-lg p-3">{msg.text_body}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-surface-400">
                      <span>Type: {msg.message_type}</span>
                      <span>Direction: {msg.direction}</span>
                      {msg.delivered_at && <span className="text-success-600">Delivered</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
