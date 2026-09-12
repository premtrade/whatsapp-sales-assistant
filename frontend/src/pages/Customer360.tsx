import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getContact, getConversations, getQuotes, getAppointments } from '@/services/api'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { ErrorState, LoadingState } from '@/components/ErrorState/ErrorState'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'

export function Customer360Page() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: contact, isLoading: contactLoading, error: contactError } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  })

  const { data: conversations } = useQuery({
    queryKey: ['conversations', 'contact', id],
    queryFn: () => getConversations({ contactId: id, page: 1, limit: 50 }),
    enabled: !!id,
  })

  const { data: quotes } = useQuery({
    queryKey: ['quotes', 'contact', id],
    queryFn: () => getQuotes({ contactId: id, page: 1, limit: 50 }),
    enabled: !!id,
  })

  const { data: appointments } = useQuery({
    queryKey: ['appointments', 'contact', id],
    queryFn: () => getAppointments({ contactId: id, page: 1, limit: 50 }),
    enabled: !!id,
  })

  if (contactLoading) {
    return <LoadingState type="spinner" />
  }

  if (contactError || !contact) {
    return <ErrorState onRetry={() => window.location.reload()} />
  }

  const convs = conversations?.data || []
  const contactQuotes = quotes?.data || []
  const contactAppointments = appointments?.data || []

  const activeConversations = convs.filter((c) => c.status !== 'closed').length
  const totalQuotes = contactQuotes.length
  const acceptedQuotes = contactQuotes.filter((q) => q.status === 'accepted').length
  const upcomingAppointments = contactAppointments.filter((a) => ['scheduled', 'confirmed'].includes(a.status)).length

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customer 360° View"
        subtitle="Complete customer profile and history"
        actions={
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary text-sm"
          >
            ← Back
          </button>
        }
      />

      {/* Customer Profile Card */}
      <div className="card">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold">
              {contact.display_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-surface-800">
                {contact.display_name || 'Unknown'}
              </h2>
              <p className="text-surface-500">{contact.phone}</p>
              {contact.email && (
                <p className="text-sm text-surface-400">{contact.email}</p>
              )}
              {contact.company && (
                <p className="text-sm text-surface-400">{contact.company}</p>
              )}
            </div>
            <div className="text-right">
              <StatusBadge status={contact.status} type="contact" />
              <p className="text-xs text-surface-400 mt-2">
                First contact: {new Date(contact.first_seen_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wide">Active Conversations</p>
          <p className="text-2xl font-bold text-primary-600 mt-1">{activeConversations}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wide">Total Quotes</p>
          <p className="text-2xl font-bold text-info-600 mt-1">{totalQuotes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wide">Accepted Quotes</p>
          <p className="text-2xl font-bold text-success-600 mt-1">{acceptedQuotes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wide">Upcoming Appointments</p>
          <p className="text-2xl font-bold text-warning-600 mt-1">{upcomingAppointments}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Conversations */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Recent Conversations</h3>
          </div>
          <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
            {convs.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-surface-400 text-center">No conversations</p>
              </div>
            ) : (
              convs.slice(0, 5).map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/inbox/${conv.id}`)}
                  className="w-full px-5 py-3 flex items-center gap-4 hover:bg-surface-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">
                      {conv.lastMessage?.text_body || 'No messages'}
                    </p>
                    <p className="text-xs text-surface-400">
                      {new Date(conv.last_message_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={conv.status} type="conversation" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Quotes */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Quotes</h3>
          </div>
          <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
            {contactQuotes.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-surface-400 text-center">No quotes</p>
              </div>
            ) : (
              contactQuotes.slice(0, 5).map((quote) => (
                <button
                  key={quote.id}
                  onClick={() => navigate(`/quotes`)}
                  className="w-full px-5 py-3 flex items-center gap-4 hover:bg-surface-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800">
                      {quote.quote_number}
                    </p>
                    <p className="text-xs text-surface-400">
                      {quote.total ? `${quote.currency} ${Number(quote.total).toLocaleString()}` : 'Pending'}
                    </p>
                  </div>
                  <StatusBadge status={quote.status} type="quote" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Appointments */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Appointments</h3>
          </div>
          <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
            {contactAppointments.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-surface-400 text-center">No appointments</p>
              </div>
            ) : (
              contactAppointments.slice(0, 5).map((apt) => (
                <button
                  key={apt.id}
                  onClick={() => navigate(`/appointments`)}
                  className="w-full px-5 py-3 flex items-center gap-4 hover:bg-surface-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800">{apt.title}</p>
                    <p className="text-xs text-surface-400">
                      {new Date(apt.starts_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={apt.status} type="appointment" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Customer Details */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Customer Details</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Phone</p>
              <p className="text-sm text-surface-800 mt-1">{contact.phone}</p>
            </div>
            {contact.email && (
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wide">Email</p>
                <p className="text-sm text-surface-800 mt-1">{contact.email}</p>
              </div>
            )}
            {contact.company && (
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wide">Company</p>
                <p className="text-sm text-surface-800 mt-1">{contact.company}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Source</p>
              <p className="text-sm text-surface-800 mt-1 capitalize">{contact.source}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wide">Preferred Language</p>
              <p className="text-sm text-surface-800 mt-1">{contact.preferred_language || 'English'}</p>
            </div>
            {contact.tags && contact.tags.length > 0 && (
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wide">Tags</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {contact.tags.map((tag: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-surface-100 text-surface-600 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {contact.notes && (
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wide">Notes</p>
                <p className="text-sm text-surface-800 mt-1">{contact.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}