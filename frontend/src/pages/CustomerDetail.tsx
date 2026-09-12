import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getContact, getConversations } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState, ErrorState } from '@/components/ErrorState/ErrorState'
import { Badge } from '@/components/Badge/Badge'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: contact, isLoading, error } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  })

  const { data: conversations } = useQuery({
    queryKey: ['customers', id, 'conversations'],
    queryFn: () => getConversations({ page: 1, limit: 10 }),
    enabled: !!id,
  })

  if (error) {
    return <ErrorState onRetry={() => window.location.reload()} />
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingState type="skeleton" count={4} />
      </div>
    )
  }

  if (!contact) {
    return <EmptyState icon={<NoDataIcon />} title="Customer not found" description="This customer may have been removed." />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={contact.display_name || 'Unknown Customer'}
        subtitle={contact.phone}
        actions={
          <button
            onClick={() => navigate('/inbox')}
            className="btn-primary"
          >
            View Conversations
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-4">Customer Information</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Full Name" value={contact.display_name} />
              <InfoField label="Phone" value={contact.phone} />
              <InfoField label="Email" value={contact.email} />
              <InfoField label="Company" value={contact.company} />
              <InfoField label="Source" value={contact.source} />
              <InfoField label="Language" value={contact.preferred_language} />
              <InfoField label="Opt-in" value={contact.opt_in ? 'Yes' : 'No'} />
              <InfoField label="Status" value={<StatusBadge status={contact.status} type="contact" />} />
            </div>
            {contact.notes && (
              <div className="mt-4 pt-4 border-t border-surface-100">
                <p className="text-xs font-medium text-surface-500 mb-1">Notes</p>
                <p className="text-sm text-surface-700">{contact.notes}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-surface-800 mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="gray">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Recent Conversations */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-4">Recent Conversations</h3>
            {conversations?.data?.length ? (
              <div className="space-y-2">
                {conversations.data.slice(0, 5).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => navigate(`/inbox/${conv.id}`)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-surface-50 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-surface-700 capitalize">{conv.channel}</p>
                      <p className="text-xs text-surface-400">{new Date(conv.started_at).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={conv.status} type="conversation" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-surface-400">No conversations yet</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-4">Activity</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-surface-400">First Seen</p>
                <p className="text-sm text-surface-700">{new Date(contact.first_seen_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400">Last Seen</p>
                <p className="text-sm text-surface-700">{new Date(contact.last_seen_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-surface-400 mb-0.5">{label}</p>
      <div className="text-sm text-surface-800">{value || '-'}</div>
    </div>
  )
}
