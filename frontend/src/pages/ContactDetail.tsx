import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getContact } from '@/services/api'
import { Skeleton } from '@/components/Skeleton/Skeleton'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  })

  if (!id) return null

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Contact Details</h1>
        <div className="bg-white shadow rounded-lg p-6">
          <Skeleton height={24} width={200} className="mb-4" />
          <Skeleton height={16} width={300} className="mb-2" />
          <Skeleton height={16} width={250} />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Contact not found</p>
        <Link to="/contacts" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to contacts
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contact Details</h1>
        <Link
          to="/contacts"
          className="mt-4 sm:mt-0 text-sm text-primary-600 hover:text-primary-700"
        >
          Back to contacts
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="text-sm text-gray-900">{contact.display_name || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="text-sm text-gray-900">{contact.phone}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="text-sm text-gray-900">{contact.email || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Company</dt>
                  <dd className="text-sm text-gray-900">{contact.company || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Source</dt>
                  <dd className="text-sm text-gray-900 capitalize">{contact.source}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="text-sm">
                    <StatusBadge status={contact.status} type="contact" />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Language</dt>
                  <dd className="text-sm text-gray-900">{contact.preferred_language}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Opt-in</dt>
                  <dd className="text-sm text-gray-900">{contact.opt_in ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Details</h3>
              <dl className="space-y-3">
                {contact.notes && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Notes</dt>
                    <dd className="text-sm text-gray-900">{contact.notes}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Tags</dt>
                  <dd className="text-sm text-gray-900">
                    {contact.tags.length > 0 ? contact.tags.join(', ') : 'No tags'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">First Seen</dt>
                  <dd className="text-sm text-gray-900">
                    {new Date(contact.first_seen_at).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Seen</dt>
                  <dd className="text-sm text-gray-900">
                    {new Date(contact.last_seen_at).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => navigate(`/conversations?contact_id=${contact.id}`)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              View Conversations
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
