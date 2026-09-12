import { useQuery } from '@tanstack/react-query'
import { getLeadScores, getLeadPipeline } from '@/services/api'
import { PageHeader } from '@/components/ErrorState/ErrorState'
import { EmptyState, NoDataIcon } from '@/components/EmptyState/EmptyState'
import { ErrorState, LoadingState } from '@/components/ErrorState/ErrorState'
import { StatusBadge } from '@/components/StatusIndicator/StatusIndicator'
import { useMemo } from 'react'

const PIPELINE_STAGES = [
  { key: 'new', label: 'New', color: 'bg-surface-400' },
  { key: 'qualified', label: 'Qualified', color: 'bg-info-500' },
  { key: 'product_interest', label: 'Product Interest', color: 'bg-primary-500' },
  { key: 'quote_requested', label: 'Quote Requested', color: 'bg-warning-500' },
  { key: 'quote_sent', label: 'Quote Sent', color: 'bg-warning-400' },
  { key: 'negotiating', label: 'Negotiating', color: 'bg-accent-500' },
  { key: 'appointment_requested', label: 'Appointment', color: 'bg-success-500' },
  { key: 'won', label: 'Won', color: 'bg-success-600' },
  { key: 'lost', label: 'Lost', color: 'bg-danger-500' },
]

export function LeadPipelinePage() {
  const { data: pipeline, isLoading: pipelineLoading, error: pipelineError } = useQuery({
    queryKey: ['lead-pipeline'],
    queryFn: getLeadPipeline,
  })

  const { data: leadScores, isLoading: scoresLoading } = useQuery({
    queryKey: ['lead-scores'],
    queryFn: () => getLeadScores({ page: 1, limit: 100 }),
  })

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const stage of PIPELINE_STAGES) {
      counts[stage.key] = 0
    }
    if (leadScores?.data) {
      for (const score of leadScores.data) {
        if (counts[score.status] !== undefined) {
          counts[score.status]++
        }
      }
    }
    return counts
  }, [leadScores])

  const totalLeads = useMemo(() => {
    return leadScores?.data?.length || 0
  }, [leadScores])

  if (pipelineError) {
    return <ErrorState onRetry={() => window.location.reload()} />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Lead Pipeline"
        subtitle="Track and manage construction leads"
      />

      {/* Pipeline Summary */}
      {pipelineLoading || scoresLoading ? (
        <LoadingState type="card" count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">Total Leads</p>
            <p className="text-2xl font-bold text-surface-900 mt-1">{totalLeads}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">Avg Score</p>
            <p className="text-2xl font-bold text-surface-900 mt-1">{pipeline?.averageScore || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">Qualified</p>
            <p className="text-2xl font-bold text-success-600 mt-1">{stageCounts['qualified'] || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">Won</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">{stageCounts['won'] || 0}</p>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.key} className="card p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-surface-700">{stage.label}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stage.color} text-white`}>
                {stageCounts[stage.key] || 0}
              </span>
            </div>
            <div className="space-y-2">
              {leadScores?.data
                ?.filter((lead) => lead.status === stage.key)
                .map((lead) => (
                  <div
                    key={lead.id}
                    className="p-3 bg-surface-50 rounded-lg border border-surface-200 hover:border-primary-300 transition-colors"
                  >
                    <p className="text-sm font-medium text-surface-900 truncate">
                      {lead.contact_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-surface-500 truncate">{lead.contact_phone}</p>
                    {lead.project_type && (
                      <p className="text-xs text-surface-600 mt-1 truncate">{lead.project_type}</p>
                    )}
                    {lead.estimated_budget && (
                      <p className="text-xs text-surface-500">{lead.estimated_budget}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs font-bold ${
                        lead.total_score >= 70 ? 'text-success-600' :
                        lead.total_score >= 30 ? 'text-warning-600' :
                        'text-danger-600'
                      }`}>
                        Score: {lead.total_score}
                      </span>
                    </div>
                  </div>
                ))}
              {(!leadScores?.data || leadScores.data.filter((lead) => lead.status === stage.key).length === 0) && (
                <p className="text-xs text-surface-400 text-center py-4">No leads</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Score Distribution */}
      {pipeline?.scoreDistribution && pipeline.scoreDistribution.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Score Distribution</h3>
          <div className="space-y-2">
            {pipeline.scoreDistribution.map((item) => (
              <div key={item.range} className="flex items-center gap-3">
                <span className="text-sm text-surface-600 flex-1">{item.range}</span>
                <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      item.range.includes('70') ? 'bg-success-500' :
                      item.range.includes('30') ? 'bg-warning-500' :
                      'bg-danger-500'
                    }`}
                    style={{ width: `${Math.min(100, (item.count / Math.max(1, totalLeads)) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-surface-800 w-8 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
