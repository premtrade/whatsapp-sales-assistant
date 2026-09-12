export interface LeadScore {
  id: string
  contact_id: string
  conversation_id?: string
  budget_score: number
  urgency_score: number
  project_type_score: number
  location_score: number
  engagement_score: number
  total_score: number
  status: 'new' | 'qualified' | 'unqualified' | 'converted' | 'lost'
  project_type?: string
  estimated_budget?: string
  preferred_timeline?: string
  project_location?: string
  score_reasoning?: Record<string, unknown>
  last_calculated_at: string
  created_at: string
  updated_at: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
}

export interface LeadScoreWithContact extends LeadScore {
  contact_name: string
  contact_phone: string
  contact_email?: string
}

export interface LeadScoreListParams {
  page?: number
  limit?: number
  status?: string
  projectType?: string
  minScore?: number
  maxScore?: number
}

export interface LeadScoreCreateRequest {
  contactId: string
  conversationId?: string
  budgetScore?: number
  urgencyScore?: number
  projectTypeScore?: number
  locationScore?: number
  engagementScore?: number
  projectType?: string
  estimatedBudget?: string
  preferredTimeline?: string
  projectLocation?: string
  scoreReasoning?: Record<string, unknown>
}

export interface LeadPipelineSummary {
  total: number
  averageScore: number
  byStatus: Record<string, number>
  byProjectType: Record<string, number>
  scoreDistribution: { range: string; count: number }[]
}

export interface FollowUp {
  id: string
  conversation_id: string
  contact_id: string
  template_key: string
  scheduled_at: string
  status: string
  sent_at?: string
  attempts: number
  max_attempts: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
