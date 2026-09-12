import { Badge } from '@/components/Badge/Badge'

interface StatusBadgeProps {
  status: string
  type?: 'conversation' | 'handoff' | 'quote' | 'appointment' | 'document' | 'staff' | 'contact' | 'lead'
}

const statusMap: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'gray' | 'primary'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  waiting_customer: { variant: 'warning', label: 'Waiting Customer' },
  waiting_agent: { variant: 'warning', label: 'Waiting Agent' },
  closed: { variant: 'gray', label: 'Closed' },
  archived: { variant: 'gray', label: 'Archived' },
  blocked: { variant: 'danger', label: 'Blocked' },
  pending: { variant: 'warning', label: 'Pending' },
  accepted: { variant: 'success', label: 'Accepted' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
  draft: { variant: 'gray', label: 'Draft' },
  sent: { variant: 'info', label: 'Sent' },
  rejected: { variant: 'danger', label: 'Rejected' },
  expired: { variant: 'warning', label: 'Expired' },
  scheduled: { variant: 'info', label: 'Scheduled' },
  confirmed: { variant: 'success', label: 'Confirmed' },
  no_show: { variant: 'danger', label: 'No Show' },
  processing: { variant: 'warning', label: 'Processing' },
  indexed: { variant: 'success', label: 'Indexed' },
  failed: { variant: 'danger', label: 'Failed' },
  inactive: { variant: 'gray', label: 'Inactive' },
  suspended: { variant: 'danger', label: 'Suspended' },
  new: { variant: 'primary', label: 'New' },
  engaged: { variant: 'info', label: 'Engaged' },
  qualified: { variant: 'success', label: 'Qualified' },
  quote_requested: { variant: 'warning', label: 'Quote Requested' },
  appointment_requested: { variant: 'warning', label: 'Appointment Requested' },
  human_handoff: { variant: 'danger', label: 'Human Handoff' },
  won: { variant: 'success', label: 'Won' },
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const normalized = status?.toLowerCase().replace(/ /g, '_') || ''
  const config = statusMap[normalized] || { variant: 'gray' as const, label: status || 'Unknown' }

  if (type === 'lead') {
    return <Badge variant={config.variant} dot>{config.label}</Badge>
  }

  return <Badge variant={config.variant}>{config.label}</Badge>
}
