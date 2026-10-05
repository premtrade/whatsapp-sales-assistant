import { useEffect, useState } from 'react'
import { getSubscription, getOnboardingStatus } from '@/services/api'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

type Step = {
  key: 'whatsapp' | 'knowledge' | 'message'
  label: string
  description: string
  href: string
  cta: string
}

const STEPS: Step[] = [
  {
    key: 'whatsapp',
    label: 'Connect WhatsApp',
    description: 'Link your business WhatsApp number to start receiving messages.',
    href: '/settings',
    cta: 'Connect now',
  },
  {
    key: 'knowledge',
    label: 'Add knowledge base',
    description: 'Upload your services, pricing, or FAQs so the AI can answer accurately.',
    href: '/knowledge',
    cta: 'Upload docs',
  },
  {
    key: 'message',
    label: 'Send a test message',
    description: 'Send your first message to verify everything is working.',
    href: '/inbox',
    cta: 'Open inbox',
  },
]

const STORAGE_KEY = 'onboarding_checklist_dismissed'

type ChecklistProps = {
  compact?: boolean
}

export default function OnboardingChecklist({ compact = false }: ChecklistProps) {
  const { staff } = useAuth()
  const { pathname } = useLocation()
  const businessId = staff?.businessId
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [isTrialing, setIsTrialing] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(!!businessId && localStorage.getItem(`${STORAGE_KEY}:${businessId}`) === 'true')
  }, [businessId])

  useEffect(() => {
    if (!businessId) {
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    async function load() {
      try {
        const [sub, onboarding] = await Promise.all([
          getSubscription(),
          getOnboardingStatus(),
        ])

        if (cancelled) return

        const subData = sub as any
        setIsTrialing(subData?.subscription?.status === 'trialing')

        setCompleted({
          whatsapp: onboarding.whatsappConnected,
          knowledge: onboarding.hasKnowledge,
          message: onboarding.hasSentMessage,
        })
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [businessId, pathname])

  const doneCount = STEPS.filter(s => completed[s.key]).length
  const allDone = doneCount === STEPS.length

  const handleDismiss = () => {
    if (businessId) localStorage.setItem(`${STORAGE_KEY}:${businessId}`, 'true')
    setDismissed(true)
  }

  if (loading || !isTrialing || dismissed || allDone) {
    return null
  }

  if (compact) {
    return (
      <div className="bg-info-50 border border-info-100 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-info-900">Setup progress</p>
          <span className="text-[10px] text-info-700">{doneCount}/{STEPS.length}</span>
        </div>
        <div className="h-1.5 bg-info-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-info-500 rounded-full transition-all duration-300"
            style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-info-50 border border-info-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-info-900">Get started</h3>
          <p className="text-xs text-info-700 mt-0.5">{doneCount}/{STEPS.length} steps complete</p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-info-500 hover:text-info-700 transition-colors"
          aria-label="Dismiss onboarding"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="h-2 bg-info-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-info-500 rounded-full transition-all duration-300"
          style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="space-y-3">
        {STEPS.map(step => {
          const isComplete = completed[step.key]
          return (
            <div
              key={step.key}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                isComplete
                  ? 'bg-success-50 border-success-100'
                  : 'bg-white border-info-100'
              }`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                isComplete ? 'bg-success-500 text-white' : 'bg-info-100 text-info-600'
              }`}>
                {isComplete ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-[10px] font-bold">{STEPS.indexOf(step) + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isComplete ? 'text-success-900' : 'text-surface-900'}`}>
                  {step.label}
                </p>
                <p className={`text-xs mt-0.5 ${isComplete ? 'text-success-700' : 'text-surface-500'}`}>
                  {step.description}
                </p>
                {!isComplete && (
                  <Link
                    to={step.href}
                    className="inline-block mt-2 text-xs font-medium text-info-700 hover:text-info-900 underline"
                  >
                    {step.cta} →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
