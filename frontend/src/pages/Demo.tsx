import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import MarketingLayout from '@/components/MarketingLayout'
import Seo from '@/components/Seo'
import { MessageBubble } from '@/components/MessageBubble/MessageBubble'
import { DEMO_SEO } from '@/seo/routes'

type DemoMessage = {
  direction: 'incoming' | 'outgoing'
  senderType: 'customer' | 'ai' | 'staff' | 'system'
  text: string | null
  createdAt: string
  document: boolean
}

type DemoData = {
  business: {
    name: string
    description: string | null
    currency: string
    timezone: string
    whatsappPhone: string | null
  }
  conversation: {
    contactName: string | null
    leadScore: number | null
    leadStatus: string | null
    projectType: string | null
    estimatedBudget: string | null
    projectLocation: string | null
    startedAt: string
    messages: DemoMessage[]
  }
  quote: {
    number: string
    total: number
    currency: string
    status: string
  } | null
  appointment: {
    title: string
    type: string
    status: string
    startsAt: string
    location: string | null
  } | null
  stats: {
    conversations: number
    aiReplies: number
    quotes: number
    quoteValue: number
    appointments: number
    averageLeadScore: number
  }
  services: { name: string; price: number; currency: string; unit: string }[]
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-JM', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

export default function DemoPage() {
  const [demo, setDemo] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/demo')
        const body = await response.json()
        if (!cancelled) {
          if (body?.success) setDemo(body.data)
          else setError(body?.message || 'The demo is not available right now.')
        }
      } catch {
        if (!cancelled) setError('The demo is not available right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const waNumber = demo?.business.whatsappPhone
  const waHref = waNumber
    ? `https://wa.me/${waNumber.replace(/[^\d]/g, '')}?text=${encodeURIComponent("Hi! I'd like to know more about roofing services.")}`
    : null

  return (
    <MarketingLayout>
      <Seo config={DEMO_SEO} />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Live demo</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-surface-950">
            Watch a WhatsApp enquiry get qualified, quoted and booked
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-surface-600">
            This is a working WAFLO tenant with sample data — a roofing business in Kingston. Every message,
            score and price below is the real product working on a real business record.
          </p>
        </div>

        {loading && (
          <div className="mt-10 rounded-2xl border border-surface-200 bg-surface-50 p-10 text-center text-surface-500">
            Loading the demo…
          </div>
        )}

        {error && !loading && (
          <div className="mt-10 rounded-2xl border border-surface-200 bg-surface-50 p-10 text-center">
            <p className="text-surface-700">{error}</p>
            <Link to="/signup" className="btn-primary mt-6 inline-flex">
              Start Free Trial
            </Link>
          </div>
        )}

        {demo && !loading && (
          <div className="mt-10 grid gap-8 lg:grid-cols-5">
            {/* The conversation */}
            <div className="lg:col-span-3">
              <div
                data-shot="conversation"
                className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm"
              >
                <div className="flex items-center gap-3 border-b border-surface-200 bg-surface-50 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-xs shrink-0">
                    {demo.business.name
                      .split(' ')
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-surface-900">{demo.business.name}</p>
                    <p className="text-xs text-surface-500">WhatsApp · {demo.conversation.contactName}</p>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
                    AI on
                  </span>
                </div>

                <div className="bg-surface-50 px-4 py-5 sm:px-6">
                  {demo.conversation.messages.map((message, index) => (
                    <div key={index}>
                      <MessageBubble
                        text_body={message.text}
                        direction={message.direction}
                        sender_type={message.senderType}
                        message_type="text"
                        created_at={message.createdAt}
                        delivered_at={message.createdAt}
                        read_at={message.direction === 'outgoing' ? message.createdAt : null}
                      />
                      {message.document && demo.quote && (
                        <div className="flex justify-end mb-4">
                          <div className="max-w-xs lg:max-w-md rounded-lg border border-surface-200 bg-white px-4 py-3">
                            <p className="text-xs font-medium text-surface-500">Quote</p>
                            <p className="mt-0.5 text-sm font-semibold text-surface-900">
                              {demo.quote.number}
                            </p>
                            <p className="text-sm text-surface-600">
                              {formatMoney(demo.quote.total, demo.quote.currency)}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-success-700">
                              {demo.quote.status}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-3 border-t border-surface-200 pt-4">
                    {demo.conversation.leadScore !== null && (
                      <span className="inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Lead Score: {demo.conversation.leadScore}/100
                      </span>
                    )}
                    {demo.conversation.leadStatus && (
                      <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                        Status: {demo.conversation.leadStatus}
                      </span>
                    )}
                    {demo.quote && (
                      <span className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700">
                        Quote Sent ✓
                      </span>
                    )}
                    {demo.appointment && (
                      <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                        Site Visit Booked ✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* The business context */}
            <div className="lg:col-span-2 space-y-6">
              <div
                data-shot="stats"
                className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
                  This month
                </h2>
                <dl className="mt-4 grid grid-cols-2 gap-4">
                  {[
                    { label: 'Conversations', value: demo.stats.conversations },
                    { label: 'AI replies', value: demo.stats.aiReplies },
                    { label: 'Quotes sent', value: demo.stats.quotes },
                    { label: 'Site visits', value: demo.stats.appointments },
                    { label: 'Avg lead score', value: demo.stats.averageLeadScore },
                    {
                      label: 'Quoted value',
                      value: formatMoney(demo.stats.quoteValue, demo.business.currency),
                    },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-surface-50 p-3">
                      <dt className="text-xs text-surface-500">{stat.label}</dt>
                      <dd className="mt-1 text-lg font-semibold text-surface-900">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {demo.appointment && (
                <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
                    Booked
                  </h2>
                  <p className="mt-3 text-sm font-medium text-surface-900">{demo.appointment.title}</p>
                  <p className="mt-1 text-sm text-surface-600">
                    {new Date(demo.appointment.startsAt).toLocaleString('en-JM', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {demo.appointment.location && (
                    <p className="mt-1 text-sm text-surface-600">{demo.appointment.location}</p>
                  )}
                </div>
              )}

              {demo.services.length > 0 && (
                <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
                    Priced from their own list
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {demo.services.map((service) => (
                      <li key={service.name} className="flex items-baseline justify-between gap-4 text-sm">
                        <span className="text-surface-700">{service.name}</span>
                        <span className="shrink-0 font-medium text-surface-900">
                          {formatMoney(service.price, service.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-surface-500">
                    The AI quotes from this list. It cannot invent a price that is not on it.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-surface-200 bg-surface-900 p-6">
                <h2 className="text-base font-semibold text-white">Try it on your own number</h2>
                <p className="mt-2 text-sm text-surface-300">
                  {waHref
                    ? 'Send our demo agent a message and watch it reply, or start your own trial in a couple of minutes.'
                    : 'Start a 14-day trial, pair your business WhatsApp number and upload your price list. No credit card required.'}
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.585 0 11.946-5.359 11.949-11.945a11.87 11.87 0 00-3.421-8.4" />
                      </svg>
                      Message our demo agent
                    </a>
                  )}
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-surface-900 transition-colors hover:bg-surface-100"
                  >
                    Start Free Trial
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MarketingLayout>
  )
}
