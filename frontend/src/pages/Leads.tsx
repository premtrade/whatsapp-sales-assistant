import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConversations, getLeadScores, getLeadPipeline } from '@/services/api'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { LoadingState } from '@/components/ErrorState/ErrorState'
import { useNavigate } from 'react-router-dom'

const leadStages = [
  { id: 'active', label: 'New Leads', color: 'bg-primary-500', description: 'Initial customer contact' },
  { id: 'waiting_customer', label: 'Engaged', color: 'bg-info-500', description: 'Customer actively communicating' },
  { id: 'waiting_agent', label: 'Qualified', color: 'bg-warning-500', description: 'Needs human follow-up' },
  { id: 'closed', label: 'Closed', color: 'bg-surface-400', description: 'Conversation completed' },
]

function LeadScoreBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 75) return 'bg-success-100 text-success-700'
    if (score >= 50) return 'bg-warning-100 text-warning-700'
    return 'bg-surface-100 text-surface-600'
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getColor()}`}>
      {score}
    </span>
  )
}

export function LeadsPage() {
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline')
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['leads'],
    queryFn: () => getConversations({ page: 1, limit: 100 }),
  })

  const { data: leadScores } = useQuery({
    queryKey: ['lead-scores'],
    queryFn: () => getLeadScores({ page: 1, limit: 100 }),
  })

  const { data: pipeline } = useQuery({
    queryKey: ['lead-pipeline'],
    queryFn: getLeadPipeline,
  })

  const conversations = data?.data || []
  const scoresMap = new Map(leadScores?.data?.map((s: any) => [s.contact_id, s.score]) || [])

  // Use real lead score from the database, with fallback for contacts without scores
  const getLeadScore = (conv: any) => {
    const realScore = scoresMap.get(conv.contact_id)
    if (realScore !== undefined) return realScore
    // Fallback: estimate based on conversation status
    const baseScore = conv.status === 'waiting_agent' ? 70 : conv.status === 'waiting_customer' ? 50 : 25
    return Math.min(100, baseScore)
  }

  const totalPipelineValue = conversations.filter((c) => c.status !== 'closed').length
  const qualifiedLeads = conversations.filter((c) => c.status === 'waiting_agent').length

  if (error) {
    return <div className="card p-8"><LoadingState type="spinner" /></div>
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        title="Sales Pipeline"
        subtitle="Track leads through your sales process"
        actions={
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="flex sm:hidden items-center gap-4 mr-auto">
              <div className="text-left">
                <p className="text-[11px] text-surface-400">Active</p>
                <p className="text-base font-semibold text-surface-800 tabular-nums">{totalPipelineValue}</p>
              </div>
              <div className="text-left">
                <p className="text-[11px] text-surface-400">Qualified</p>
                <p className="text-base font-semibold text-warning-600 tabular-nums">{qualifiedLeads}</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 mr-4">
              <div className="text-right">
                <p className="text-xs text-surface-400">Active Leads</p>
                <p className="text-lg font-semibold text-surface-800">{totalPipelineValue}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-surface-400">Qualified</p>
                <p className="text-lg font-semibold text-warning-600">{qualifiedLeads}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5 ml-auto sm:ml-0">
              <button
                onClick={() => setView('pipeline')}
                aria-pressed={view === 'pipeline'}
                className={`touch-target px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'pipeline' ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500'
                }`}
              >
                Pipeline
              </button>
              <button
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                className={`touch-target px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'list' ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500'
                }`}
              >
                List
              </button>
            </div>
          </div>
        }
      />

      {isLoading ? (
        <LoadingState type="card" count={4} />
      ) : conversations.length === 0 ? (
        <div className="card">
          <EmptyState icon={<NoDataIcon />} title="No leads yet" description="Leads will appear here when customers start conversations." />
        </div>
      ) : view === 'pipeline' ? (
        <div className="flex sm:grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 sm:pb-0">
          {leadStages.map((stage) => {
            const stageConversations = conversations.filter((c) => c.status === stage.id)
            return (
              <div key={stage.id} className="card flex flex-col min-w-[78vw] sm:min-w-0 snap-start">
                <div className="px-4 py-3 border-b border-surface-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                      <span className="text-sm font-semibold text-surface-800">{stage.label}</span>
                    </div>
                    <span className="text-xs font-medium text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full">
                      {stageConversations.length}
                    </span>
                  </div>
                  <p className="text-xs text-surface-400">{stage.description}</p>
                </div>
                <div className="flex-1 p-2 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
                  {stageConversations.length === 0 ? (
                    <p className="text-xs text-surface-400 text-center py-4">No leads</p>
                  ) : (
                    stageConversations.map((conv) => {
                      const score = getLeadScore(conv)
                      return (
                        <button
                          key={conv.id}
                          onClick={() => navigate(`/inbox/${conv.id}`)}
                          className="touch-target w-full p-3 rounded-lg border border-surface-100 hover:border-primary-200 hover:bg-primary-50/30 active:bg-primary-50 transition-colors text-left group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-surface-800 truncate">
                                {conv.contact?.display_name || conv.contact?.phone || 'Unknown'}
                              </p>
                              <p className="text-xs text-surface-400 mt-0.5">
                                {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString() : '-'}
                              </p>
                            </div>
                            <LeadScoreBadge score={score} />
                          </div>
                          {conv.contact?.company && (
                            <p className="text-xs text-surface-400 mt-1 truncate">{conv.contact.company}</p>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="table-header">Customer</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Stage</th>
                  <th className="table-header hidden md:table-cell">Last Activity</th>
                  <th className="table-header hidden md:table-cell">Lead Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {conversations.map((conv) => (
                  <tr
                    key={conv.id}
                    onClick={() => navigate(`/inbox/${conv.id}`)}
                    className="table-row cursor-pointer"
                  >
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold shrink-0">
                          {conv.contact?.display_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-surface-800">
                            {conv.contact?.display_name || 'Unknown'}
                          </span>
                          {conv.contact?.company && (
                            <p className="text-xs text-surface-400">{conv.contact.company}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-surface-600">{conv.contact?.phone}</td>
                    <td className="table-cell"><StatusBadge status={conv.status} type="conversation" /></td>
                    <td className="table-cell text-surface-400 text-xs hidden md:table-cell">
                      {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString() : '-'}
                    </td>
                    <td className="table-cell hidden md:table-cell">
                      <LeadScoreBadge score={getLeadScore(conv)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
