interface MessageBubbleProps {
  text_body: string | null
  direction: 'incoming' | 'outgoing'
  sender_type: 'customer' | 'ai' | 'staff' | 'system'
  message_type: string
  created_at: string
  delivered_at?: string | null
  read_at?: string | null
}

export function MessageBubble({
  text_body,
  direction,
  sender_type,
  message_type,
  created_at,
  delivered_at,
  read_at,
}: MessageBubbleProps) {
  const isOutgoing = direction === 'outgoing'
  const isSystem = sender_type === 'system'
  const isAi = sender_type === 'ai'

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
          {text_body || 'System message'}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOutgoing
            ? 'bg-primary-600 text-white'
            : isAi
            ? 'bg-gray-100 text-gray-800'
            : 'bg-white border border-gray-200 text-gray-800'
        }`}
      >
        {message_type !== 'text' && text_body && (
          <p className="text-sm whitespace-pre-wrap break-words">{text_body}</p>
        )}
        {message_type === 'text' && text_body && (
          <p className="text-sm whitespace-pre-wrap break-words">{text_body}</p>
        )}
        <div className={`flex items-center mt-1 space-x-1 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-xs ${isOutgoing ? 'text-primary-100' : 'text-gray-400'}`}>
            {new Date(created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isOutgoing && (
            <span className="text-xs text-primary-100">
              {read_at ? '✓✓' : delivered_at ? '✓' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
