import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConversation, sendMessage, updateConversationStatus, getCustomerFacts } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { useWebSocket } from '@/context/WebSocketContext'
import toast from 'react-hot-toast'
import type { Message, CustomerFact } from '@/types'

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { subscribe } = useWebSocket()
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [showContext, setShowContext] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: conversationData, isLoading: convLoading, error: convError } = useQuery({
    queryKey: ['conversations', id],
    queryFn: () => getConversation(id!),
    enabled: !!id,
  })

  const { data: customerFacts } = useQuery({
    queryKey: ['customer-facts', conversationData?.contact_id],
    queryFn: () => getCustomerFacts(conversationData!.contact_id),
    enabled: !!conversationData?.contact_id,
  })

  const isLoadingMsgs = convLoading

  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages)
    }
  }, [conversationData])

  useEffect(() => {
    const unsubscribe = subscribe<Message>('new_message', (msg) => {
      if (msg.payload.conversation_id === id) {
        setMessages((prev) => [...prev, msg.payload as Message])
      }
    })
    return unsubscribe
  }, [id, subscribe])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMessage(id!, { text_body: text }),
    onSuccess: (msg) => {
      setMessages((prev) => [...prev, msg])
      setNewMessage('')
    },
    onError: () => toast.error('Failed to send message'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateConversationStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', id] })
      toast.success('Status updated')
    },
  })

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    sendMutation.mutate(newMessage.trim())
  }

  if (convError) {
    return <ErrorState onRetry={() => queryClient.invalidateQueries({ queryKey: ['conversations', id] })} />
  }

  const conversation = conversationData
  const contact = conversation?.contact

  return (
    <div className="animate-fade-in h-[calc(100vh-8rem)]">
      <div className="card overflow-hidden h-full flex">
        {/* Center: Conversation Thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3 border-b border-surface-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate('/inbox')}
                className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors lg:hidden"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-semibold shrink-0">
                {contact?.display_name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-surface-800 truncate">
                  {contact?.display_name || contact?.phone || 'Unknown'}
                </p>
                <p className="text-xs text-surface-400">{contact?.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {conversation && <StatusBadge status={conversation.status} type="conversation" />}
              <button
                onClick={() => setShowContext(!showContext)}
                className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors lg:hidden"
                title="Toggle context"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

          {conversation?.active_handoff && (
            <div className="px-5 py-3 border-b border-warning-200 bg-warning-50 flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-warning-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.667 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.333.19 3 1.73 3z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-warning-800">
                  {conversation.active_handoff.status === 'pending'
                    ? 'AI requested human handoff'
                    : 'Human agent assigned'}
                </p>
                <p className="text-xs text-warning-700 truncate">{conversation.active_handoff.reason}</p>
              </div>
            </div>
          )}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 bg-surface-50">
            {isLoadingMsgs ? (
              <LoadingState type="skeleton" count={6} />
            ) : messages.length === 0 ? (
              <EmptyState icon={<NoDataIcon />} title="No messages yet" description="Start the conversation by sending a message." />
            ) : (
              <div className="space-y-1">
                {messages.map((msg, idx) => {
                  const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1].created_at).toDateString()
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex items-center justify-center my-4">
                          <span className="px-3 py-1 text-xs font-medium text-surface-400 bg-surface-100 rounded-full">
                            {new Date(msg.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      )}
                      <MessageBubble message={msg} />
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <form onSubmit={handleSend} className="px-4 py-3 border-t border-surface-200 flex items-center gap-2 shrink-0 bg-white">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2.5 text-sm border border-surface-200 rounded-lg bg-surface-50 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sendMutation.isPending}
              className="px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendMutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>

        {/* Right: Customer Context Panel */}
        {showContext && (
          <div className="w-80 border-l border-surface-200 overflow-y-auto scrollbar-thin hidden lg:block shrink-0">
            <div className="p-4 space-y-5">
              {/* Customer Info */}
              <div>
                <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Customer</h3>
                <div className="space-y-2">
                  <ContextField label="Name" value={contact?.display_name} />
                  <ContextField label="Phone" value={contact?.phone} />
                  <ContextField label="Email" value={contact?.email} />
                  <ContextField label="Company" value={contact?.company} />
                  <ContextField label="Language" value={contact?.preferred_language} />
                </div>
              </div>

              {/* Lead Score */}
              {conversation?.leadScore && (
                <div>
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Lead Score</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      conversation.leadScore.total_score >= 70 ? 'bg-success-100 text-success-700' :
                      conversation.leadScore.total_score >= 30 ? 'bg-warning-100 text-warning-700' :
                      'bg-danger-100 text-danger-700'
                    }`}>
                      {conversation.leadScore.total_score}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-surface-800 capitalize">{conversation.leadScore.status.replace('_', ' ')}</p>
                      {conversation.leadScore.project_type && (
                        <p className="text-xs text-surface-500">{conversation.leadScore.project_type}</p>
                      )}
                      {conversation.leadScore.estimated_budget && (
                        <p className="text-xs text-surface-500">{conversation.leadScore.estimated_budget}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Customer Facts */}
              {customerFacts && customerFacts.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Customer Facts</h3>
                  <div className="space-y-1.5">
                    {customerFacts.map((fact: CustomerFact) => (
                      <div key={fact.fact_key} className="flex items-start justify-between gap-2">
                        <span className="text-xs text-surface-500 capitalize">{fact.fact_key.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-surface-800 font-medium text-right truncate">{fact.fact_value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Appointments */}
              {conversation?.upcoming_appointments && conversation.upcoming_appointments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Upcoming Appointments</h3>
                  <div className="space-y-2">
                    {conversation.upcoming_appointments.map((apt) => (
                      <div key={apt.id} className="px-3 py-2 bg-surface-50 rounded-lg">
                        <p className="text-xs font-medium text-surface-800">{apt.title}</p>
                        <p className="text-xs text-surface-500">
                          {new Date(apt.starts_at).toLocaleString()} · {apt.status}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Quotes */}
              {conversation?.recent_quotes && conversation.recent_quotes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Recent Quotes</h3>
                  <div className="space-y-2">
                    {conversation.recent_quotes.map((quote) => (
                      <div key={quote.id} className="px-3 py-2 bg-surface-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-surface-800">{quote.quote_number}</p>
                          <StatusBadge status={quote.status} type="quote" />
                        </div>
                        <p className="text-xs text-surface-500 mt-0.5">
                          {quote.currency} {Number(quote.total).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation Status */}
              <div>
                <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Status</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-500">Status</span>
                    {conversation && <StatusBadge status={conversation.status} type="conversation" />}
                  </div>
                  <ContextField label="Channel" value={conversation?.channel} />
                  <ContextField label="Started" value={conversation?.started_at ? new Date(conversation.started_at).toLocaleString() : undefined} />
                  <ContextField label="Last Activity" value={conversation?.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : undefined} />
                </div>
              </div>

              {/* Actions */}
              <div>
                <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => statusMutation.mutate('waiting_agent')}
                    className="w-full px-3 py-2 text-xs font-medium text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors text-left"
                  >
                    Mark as Waiting
                  </button>
                  <button
                    onClick={() => statusMutation.mutate('closed')}
                    className="w-full px-3 py-2 text-xs font-medium text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors text-left"
                  >
                    Mark Resolved
                  </button>
                  <button
                    onClick={() => navigate(`/customers/${contact?.id}`)}
                    className="w-full px-3 py-2 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors text-left"
                  >
                    View Customer Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isIncoming = message.direction === 'incoming'
  const isAi = message.sender_type === 'ai'
  const isStaff = message.sender_type === 'staff'

  return (
    <div className={`flex ${isIncoming ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[75%] ${isIncoming ? 'order-2' : 'order-1'}`}>
        {/* Sender label */}
        <div className={`flex items-center gap-1.5 mb-1 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
          {isAi && (
            <span className="text-[10px] font-medium text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">AI Assistant</span>
          )}
          {isStaff && (
            <span className="text-[10px] font-medium text-surface-400">Staff</span>
          )}
          {message.sender_type === 'customer' && (
            <span className="text-[10px] font-medium text-surface-400">Customer</span>
          )}
        </div>
        {/* Bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl ${
            isIncoming
              ? isAi
                ? 'bg-primary-50 border border-primary-100 text-surface-800'
                : 'bg-white border border-surface-200 text-surface-800'
              : 'bg-primary-600 text-white'
          }`}
        >
          {message.media_url && message.message_type === 'image' && (
            <img
              src={message.media_url}
              alt={message.caption || 'image'}
              className="rounded-lg max-w-full mb-2"
              loading="lazy"
            />
          )}
          {message.media_url && message.message_type === 'video' && (
            <video src={message.media_url} controls className="rounded-lg max-w-full mb-2" />
          )}
          {message.media_url && message.message_type === 'audio' && (
            <audio src={message.media_url} controls className="mb-2 w-full" />
          )}
          {message.media_url && message.message_type === 'document' && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noreferrer"
              className={`block mb-2 text-xs underline ${isIncoming ? 'text-primary-700' : 'text-white'}`}
            >
              Download document
            </a>
          )}
          {message.caption && (
            <p className="text-xs italic opacity-75 mb-1">{message.caption}</p>
          )}
          {message.text_body && (
            <p className="text-sm whitespace-pre-wrap break-words">{message.text_body}</p>
          )}
        </div>
        {/* Timestamp */}
        <div className={`flex items-center mt-0.5 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
          <span className="text-[10px] text-surface-400">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isIncoming && message.read_at && (
            <span className="text-[10px] text-primary-500 ml-1">Read</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ContextField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-surface-500 shrink-0">{label}</span>
      <span className="text-xs text-surface-800 font-medium text-right truncate">{value || '-'}</span>
    </div>
  )
}
