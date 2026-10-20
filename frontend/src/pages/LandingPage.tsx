import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { submitContactInquiry, getPlans } from '@/services/api'
import Seo from '@/components/Seo'
import SectionHeading from '@/components/SectionHeading'
import MarketingLayout from '@/components/MarketingLayout'
import { getStaticPlans } from '@/seo/staticPlans'
import { LANDING_SEO } from '@/seo/routes'
import type { Plan } from '@/types'

const features = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: 'Live WhatsApp Inbox',
    description:
      'Every message in one place, with full customer context and an AI note on each thread. See conversations as they happen instead of scrolling up.',
    featured: true,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'AI Responses 24/7',
    description: 'Groq LLM plus your knowledge base. Accurate, on-brand answers even at midnight.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: 'Lead Scoring',
    description: 'A 0–100 score from budget, urgency, project type, location and engagement.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'PDF Quotes to WhatsApp',
    description: 'Branded quotes generated and delivered in seconds, priced from your own list.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Appointments & Reminders',
    description: 'Book site visits with conflict detection, and let the reminders go out for you.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Smart Handoffs',
    description: 'The assistant knows when a lead needs a human, and hands over with full context.',
  },
]

const problems = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    headline: 'Missed messages are missed jobs',
    copy: 'A customer WhatsApps at 8 PM. You are on a job site. They call a competitor. Gone for good.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    headline: 'Quotes take hours',
    copy: 'Typing PDFs, adding up totals, chasing replies. Your competition is quoting in 30 seconds.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    headline: 'No idea who is serious',
    copy: 'Some people want a price. Some are ready to book. Without scoring, you waste time on tyre-kickers.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 5.636A12 12 0 0112 3c5.523 0 10 1.54 12 4.636M3 12.322A12 12 0 0112 9c4.21 0 8 1.178 10.63 3.322M3 18.722A12 12 0 0112 15c3.521 0 7.21 1.062 10 3.268m6.308-6.265a12 12 0 010.891 6.565M12 21a9 9 0 100-9-9" />
      </svg>
    ),
    headline: 'Follow-ups fall through',
    copy: 'You meant to call that lead from last week. You forgot. They hired someone else.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Connect WhatsApp',
    copy: 'Pair your business WhatsApp number from the dashboard. We run the integration for you.',
  },
  {
    num: '02',
    title: 'Load what you know',
    copy: 'Upload your services, price list and FAQs. The assistant answers from those and nothing else.',
  },
  {
    num: '03',
    title: 'Watch the jobs come in',
    copy: 'Leads get scored, quotes go out and site visits get booked while you are on site.',
  },
]

const guarantees = [
  {
    title: 'It will not invent a price',
    copy: 'Quotes are priced from your own product list, not from the model. If it cannot find a price it says so and offers a person.',
  },
  {
    title: 'It will not promise a slot it cannot keep',
    copy: 'Appointments are checked against your existing schedule before a time is confirmed back to the customer.',
  },
  {
    title: 'It will not pretend to be human',
    copy: 'Replies make clear that the customer is talking to an AI assistant, so nobody is misled about what they are getting.',
  },
  {
    title: 'It will not work past you',
    copy: 'When a request needs judgement — a complaint, an approval, an unusual job — it hands over with a summary of what was asked.',
  },
]

const fitPoints = [
  {
    title: 'Your own knowledge base',
    copy: 'Load your services, price list and FAQs. The assistant answers from those documents and from the conversation history.',
  },
  {
    title: 'Your team stays in control',
    copy: 'Every AI reply is visible in the inbox with the lead score beside it. Take over a conversation in one tap, in the same WhatsApp thread.',
  },
  {
    title: 'The number your customers already have',
    copy: 'Connect the business number you already publish. Your customers keep messaging the same number they message today.',
  },
]

const faqs = [
  {
    q: 'Do I need technical skills to set this up?',
    a: 'No. Creating the account and pairing your WhatsApp number are a few minutes of work. The part that determines how good the answers are is your knowledge base — your services, price list and FAQs — and we can build that with you as part of a managed setup.',
  },
  {
    q: 'Will the AI sound like a robot?',
    a: 'No. It is powered by Groq LLM with your business knowledge base, and you set the tone it uses.',
  },
  {
    q: 'What if the AI cannot answer a question?',
    a: 'It says so and hands over to your team with the full conversation attached, so nobody has to start from scratch.',
  },
  {
    q: 'Can I use my existing WhatsApp Business number?',
    a: 'Yes. We connect to the number you already publish, so there is no new number for your customers to learn.',
  },
  {
    q: 'Is my data secure?',
    a: 'Your data is stored on our servers and scoped to your business, so other tenants never see it. Replies and document retrieval are processed by the AI and embedding providers listed in our Privacy Policy.',
  },
  {
    q: 'Do customers know they are talking to an AI?',
    a: 'Yes. WAFLO is configured to say so in the first reply. An owner whose customers think they are talking to a person is exposed when the limitation shows.',
  },
  {
    q: 'What does a subscription cost on top of WhatsApp fees?',
    a: 'Each plan includes a set number of AI replies per month, shown on the pricing table. WhatsApp conversation charges from Meta are separate and passed through at cost, so your total depends on your message volume. Ask us and we will model it for you before you commit.',
  },
  {
    q: 'What if I want to run this on my own servers?',
    a: 'WAFLO is a managed service. We run the application, the WhatsApp connection, the AI pipeline and the updates, and you use it from your browser.',
  },
]

const PLAN_TAGLINES: Record<string, string> = {
  starter: 'One number, one operator.',
  professional: 'A business with a team behind it.',
  business: 'Multiple numbers, multiple locations.',
}

const techStack = [
  'Express',
  'React',
  'PostgreSQL',
  'pgvector',
  'Groq',
  'Gemini',
  'n8n',
  'WAHA',
  'Redis',
  'Docker',
  'TypeScript',
]

type DemoSummary = {
  agentNumber: string | null
  agentName: string
  contactName: string | null
  leadScore: number | null
  leadStatus: string | null
  quoteSent: boolean
  appointmentBooked: boolean
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [contactSubmitted, setContactSubmitted] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(getStaticPlans())
  const [plansLoading, setPlansLoading] = useState(getStaticPlans() === null)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [demo, setDemo] = useState<DemoSummary | null>(null)
  const location = useLocation()

  // The public demo. The agent's number is only returned once a real number
  // has been paired to the demo tenant, so a visitor is never sent a message
  // to a placeholder.
  useEffect(() => {
    let cancelled = false
    fetch('/api/demo')
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body?.success) return
        const data = body.data
        setDemo({
          agentNumber: data.business?.whatsappPhone ?? null,
          agentName: data.business?.whatsappName || 'ROLINJ.IO',
          contactName: data.conversation?.contactName ?? null,
          leadScore: data.conversation?.leadScore ?? null,
          leadStatus: data.conversation?.leadStatus ?? null,
          quoteSent: Boolean(data.quote),
          appointmentBooked: Boolean(data.appointment),
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch pricing plans from the backend so the public page always agrees with
  // enforcement. When plans were captured at build time they are already in
  // state, and the live fetch still runs afterwards to pick up any change.
  useEffect(() => {
    let cancelled = false
    async function loadPlans() {
      try {
        const data = await getPlans()
        if (!cancelled) {
          setPlans(data)
          setPlansLoading(false)
        }
      } catch {
        if (!cancelled) {
          setPlansError('Unable to load plans. Please refresh.')
          setPlansLoading(false)
        }
      }
    }
    loadPlans()
    return () => {
      cancelled = true
    }
  }, [])

  // Deep links into a section work from any page, and the sticky header does
  // not cover the heading it scrolls to.
  useEffect(() => {
    if (!location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    if (!target) return
    const timer = setTimeout(
      () => target.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      80
    )
    return () => clearTimeout(timer)
  }, [location.hash])

  const waHref = demo?.agentNumber
    ? `https://wa.me/${demo.agentNumber.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
        "Hi, I'm interested in automating parts of my business. What do you offer?"
      )}`
    : null

  return (
    <MarketingLayout>
      <Seo config={LANDING_SEO} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-b from-primary-50/70 via-white to-white" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: '36px 36px',
            }}
          />
          <div className="absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary-200/40 blur-3xl" />
          <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-accent-100/50 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-12 pt-8 sm:pt-12 lg:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-3 py-1 text-xs font-semibold text-primary-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />
                Now with AI-powered lead scoring
              </span>

              <h1 className="mt-5 text-[2.15rem] font-bold leading-[1.08] tracking-tight text-surface-950 sm:text-5xl lg:text-[3.4rem]">
                Your WhatsApp Inbox Is a Sales Pipeline.{' '}
                <span className="text-primary-600">Stop Letting It Slip.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-surface-600 sm:text-lg">
                WAFLO is an AI sales assistant that qualifies leads, sends quotes and books appointments — 24/7,
                right inside WhatsApp. Built for small and medium businesses that cannot afford to lose an enquiry.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/20 transition-all hover:-translate-y-0.5 hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:text-base"
                >
                  Start free trial
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center rounded-xl border border-surface-200 bg-white px-7 py-3 text-sm font-semibold text-surface-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-surface-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 sm:text-base"
                >
                  See a real session
                </Link>
              </div>

              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-green-700 transition-colors hover:text-green-600"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.585 0 11.946-5.359 11.949-11.945a11.87 11.87 0 00-3.421-8.4" />
                  </svg>
                  Or message {demo?.agentName ?? 'ROLINJ.IO'}&apos;s assistant on WhatsApp
                </a>
              )}

              <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-surface-500">
                {['No credit card required', '14-day free trial', 'Cancel any time'].map((point) => (
                  <li key={point} className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* The real product */}
            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl shadow-surface-900/10">
                <div className="flex items-center gap-2 border-b border-surface-200 bg-surface-50 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary-500" aria-hidden="true" />
                  <span className="text-xs font-medium text-surface-600">WhatsApp</span>
                  <span className="ml-auto truncate text-xs text-surface-400">Harbour Point Roofing</span>
                </div>
                <img
                  src="/images/demo-conversation.jpg"
                  alt="A real WAFLO session: a customer asks for a quote for a 2,000 square foot roof in St. Andrew. The assistant prices it from the business price list and sends a quote."
                  width={1266}
                  height={1320}
                  className="block h-auto w-full"
                  loading="eager"
                  decoding="async"
                />
              </div>

              {/* Real numbers from the demo tenant */}
              <div className="mt-3 flex flex-wrap gap-2">
                {demo?.leadScore != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
                    Lead score {demo.leadScore}/100
                  </span>
                )}
                {demo?.leadStatus && (
                  <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold capitalize text-blue-700">
                    {demo.leadStatus}
                  </span>
                )}
                {demo?.quoteSent && (
                  <span className="rounded-lg bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-purple-700">
                    Quote sent
                  </span>
                )}
                {demo?.appointmentBooked && (
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                    Site visit booked
                  </span>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-surface-400">
                A real WAFLO session, recorded from a working tenant.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-surface-200 bg-surface-50/70 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="The cost of doing nothing"
            title="You’re losing jobs before you even quote them."
            lede="Every missed WhatsApp message is a competitor’s closed deal. Here is what happens when you do not have WAFLO."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {problems.map((p) => (
              <div
                key={p.headline}
                className="group rounded-2xl border border-surface-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-surface-300 hover:shadow-card-hover"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-100 text-surface-600 transition-colors group-hover:bg-primary-50 group-hover:text-primary-700">
                  {p.icon}
                </span>
                <h3 className="mt-4 text-sm font-semibold text-surface-900">{p.headline}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-surface-600">{p.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="scroll-mt-20 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="How it works"
            title="Live in three steps."
            lede="From signup to your AI sales rep, without an engineer."
          />
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.num} className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-600 text-sm font-bold text-white shadow-sm shadow-primary-600/25">
                    {s.num}
                  </span>
                  {s.num !== '03' && (
                    <span className="hidden h-px flex-1 bg-gradient-to-r from-surface-300 to-transparent md:block" aria-hidden="true" />
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold text-surface-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-surface-600">{s.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-y border-surface-200 bg-surface-50/70 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Features"
            title="Everything you need to close more jobs from WhatsApp."
            lede="From first message to booked job, WAFLO handles the sales work so you can get on with the work itself."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className={
                  f.featured
                    ? 'group relative flex flex-col overflow-hidden rounded-2xl bg-surface-900 p-6 text-white shadow-xl shadow-surface-900/10'
                    : 'group flex flex-col rounded-2xl border border-surface-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-surface-300 hover:shadow-card-hover'
                }
              >
                {f.featured && (
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-500/20 blur-3xl"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={
                    f.featured
                      ? 'relative grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white'
                      : 'grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100'
                  }
                >
                  {f.icon}
                </span>
                <h3
                  className={
                    f.featured
                      ? 'relative mt-4 text-lg font-semibold tracking-tight text-white'
                      : 'mt-4 text-sm font-semibold text-surface-900'
                  }
                >
                  {f.title}
                </h3>
                <p
                  className={
                    f.featured
                      ? 'relative mt-2 text-sm leading-relaxed text-surface-300'
                      : 'mt-1.5 text-sm leading-relaxed text-surface-600'
                  }
                >
                  {f.description}
                </p>

                {/* Real numbers from the demo tenant */}
                {f.featured && demo && (
                  <div className="relative mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                    {demo.leadScore != null && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-400" aria-hidden="true" />
                        Lead score {demo.leadScore}/100
                      </span>
                    )}
                    {demo.quoteSent && (
                      <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                        Quote sent from their own scope
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Command centre"
            title="Your sales team’s command center."
            lede="Live conversations, lead scores, quotes, appointments and handoffs. No refreshing, no CSV exports."
          />
          <figure className="mt-8">
            <div className="overflow-hidden rounded-2xl border border-surface-200 bg-surface-900 p-2 shadow-2xl shadow-surface-900/15">
              <div className="overflow-hidden rounded-xl bg-surface-800">
                <div className="flex items-center gap-2 border-b border-surface-700 px-4 py-2.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs font-medium text-surface-400">WAFLO Dashboard</span>
                  <span className="ml-auto hidden text-xs text-surface-500 sm:block">
                    ROLINJ.IO — a working tenant
                  </span>
                </div>
                <img
                  src="/images/demo-dashboard.jpg"
                  alt="The WAFLO dashboard for a roofing business: live conversations with lead scores, quotes sent, site visits booked and pipeline value, all on one screen."
                  width={1680}
                  height={1050}
                  className="block h-auto w-full"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-surface-400">
              The real dashboard, running on a live business.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Guarantees */}
      <section className="border-y border-surface-200 bg-surface-50/70 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Boundaries"
            title="What the assistant will never do."
            lede="You are putting a customer-facing agent in your business name. These boundaries are built into the product, not promised on this page."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {guarantees.map((g) => (
              <div
                key={g.title}
                className="flex gap-3 rounded-2xl border border-surface-200 bg-white p-5 shadow-card"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-surface-900">{g.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-surface-600">{g.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fit */}
      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Who it is for"
            title="Built for service businesses like yours."
            lede="WAFLO is built around one assumption: your customers message you, and you are busy doing the actual work."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {fitPoints.map((f) => (
              <div key={f.title} className="rounded-2xl border border-surface-200 bg-white p-6 shadow-card">
                <h3 className="text-sm font-semibold text-surface-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-surface-600">{f.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="border-y border-surface-200 bg-surface-50/70 py-12 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-md">
              <h2 className="text-lg font-bold tracking-tight text-surface-950">
                Built on proven technology. Run for you.
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-surface-600">
                We run the application, the WhatsApp connection, the AI pipeline and the updates. You use it from
                your browser.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {techStack.map((tool) => (
                <li
                  key={tool}
                  className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-600"
                >
                  {tool}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple plans, priced per month."
            lede="Every plan includes the AI assistant, the inbox, quotes, appointments and handoffs. The difference is how much you use it."
          />

          {plansLoading && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-80 animate-pulse rounded-2xl border border-surface-200 bg-surface-50" />
              ))}
            </div>
          )}

          {plansError && (!plans || plans.length === 0) && (
            <p className="mt-8 rounded-xl border border-warning-100 bg-warning-50 p-4 text-sm text-warning-900">
              {plansError}
            </p>
          )}

          {plans && plans.length > 0 && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isMostPopular = plan.slug === 'professional'
                const featuresList = (plan.features || {}) as Record<string, boolean | undefined>
                const limits = (plan.limits || {}) as Record<string, number | undefined>
                const featureLabels: Record<string, string> = {
                  lead_scoring: 'Lead scoring',
                  quote_generation: 'PDF quotes',
                  appointments: 'Appointments & reminders',
                  handoffs: 'Smart handoffs',
                  knowledge_base: 'Knowledge base',
                  api_access: 'API access',
                  multi_location: 'Multiple locations',
                  crm_integration: 'CRM integration',
                  custom_branding: 'Custom branding',
                }
                const available = Object.entries(featureLabels).filter(
                  ([key]) => featuresList[key] === true
                )
                return (
                  <div
                    key={plan.id}
                    className={
                      isMostPopular
                        ? 'relative flex flex-col rounded-2xl border-2 border-primary-500 bg-white p-6 shadow-xl shadow-primary-600/10'
                        : 'relative flex flex-col rounded-2xl border border-surface-200 bg-white p-6 shadow-card'
                    }
                  >
                    {isMostPopular && (
                      <span className="absolute -top-3 left-6 rounded-full bg-primary-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                        Most popular
                      </span>
                    )}
                    <h3 className="text-base font-semibold text-surface-900">{plan.name}</h3>
                    <p className="mt-1 text-sm text-surface-500">
                      {PLAN_TAGLINES[plan.slug] || 'Everything you need to run WhatsApp sales.'}
                    </p>
                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight text-surface-950">
                        {plan.currency} {Number(plan.price_monthly).toLocaleString()}
                      </span>
                      <span className="text-sm text-surface-500">/month</span>
                    </div>
                    <Link
                      to="/signup"
                      className={
                        isMostPopular
                          ? 'mt-5 inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500'
                          : 'mt-5 inline-flex items-center justify-center rounded-xl border border-surface-200 bg-surface-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-surface-800'
                      }
                    >
                      Start free trial
                    </Link>
                    <ul className="mt-5 space-y-2 border-t border-surface-100 pt-5 text-sm text-surface-600">
                      {available.map(([key, label]) => (
                        <li key={key} className="flex items-center gap-2">
                          <svg className="h-4 w-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          {label}
                        </li>
                      ))}
                      {limits.ai_responses ? (
                        <li className="flex items-center gap-2">
                          <svg className="h-4 w-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          {limits.ai_responses.toLocaleString()} AI replies a month
                        </li>
                      ) : null}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-6 max-w-2xl space-y-2 text-sm text-surface-500">
            <p>
              One AI response is one reply the assistant sends to a customer. WhatsApp conversation charges from
              Meta are separate from our subscription and are passed through at cost — your total depends on your
              message volume. Ask us and we will model it for you before you commit.
            </p>
            <p className="text-surface-400">
              Prices in USD. Change or cancel your plan from the Billing page at any time.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-surface-200 bg-surface-50/70 py-14 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="FAQ" title="Frequently asked questions." align="center" />
          <div className="mt-8 divide-y divide-surface-200 overflow-hidden rounded-2xl border border-surface-200 bg-white">
            {faqs.map((faq, i) => {
              const isOpen = openFaq === i
              return (
                <div key={i}>
                  <h3>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-50"
                    >
                      <span className="text-sm font-semibold text-surface-900">{faq.q}</span>
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-surface-200 text-surface-500 transition-transform ${
                          isOpen ? 'rotate-45 border-primary-200 bg-primary-50 text-primary-700' : ''
                        }`}
                        aria-hidden="true"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </button>
                  </h3>
                  {isOpen && (
                    <div className="px-5 pb-5 text-sm leading-relaxed text-surface-600">{faq.a}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface-900 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[2.1rem]">
              Ready to stop missing WhatsApp leads?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-surface-300">
              Start your 14-day free trial, or tell us a little about your business and what you need.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/20 transition-all hover:-translate-y-0.5 hover:bg-primary-500 sm:text-base"
              >
                Get started free
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center rounded-xl border border-surface-700 px-7 py-3 text-sm font-semibold text-surface-200 transition-colors hover:border-surface-600 hover:text-white sm:text-base"
              >
                See a real session
              </Link>
            </div>
            <p className="mt-5 text-sm text-surface-400">
              Prefer email?{' '}
              <a
                href="mailto:premtrade_ja@outlook.com"
                className="text-primary-400 underline underline-offset-4 hover:text-primary-300"
              >
                premtrade_ja@outlook.com
              </a>
            </p>
          </div>

          <form
            className="rounded-2xl bg-white p-6 shadow-2xl shadow-black/20 sm:p-7"
            onSubmit={async (event) => {
              event.preventDefault()
              setContactLoading(true)
              setContactError(null)
              try {
                const formData = new FormData(event.currentTarget)
                const name = String(formData.get('name') || '').trim()
                const business = String(formData.get('business') || '').trim()
                const email = String(formData.get('email') || '').trim()
                const whatsapp = String(formData.get('whatsapp') || '').trim()
                const message = String(formData.get('message') || '').trim()
                await submitContactInquiry({
                  name,
                  business: business || undefined,
                  email,
                  whatsapp: whatsapp || undefined,
                  message,
                })
                setContactSubmitted(true)
              } catch (err: any) {
                setContactError(err?.message || 'Something went wrong. Please try again later.')
              } finally {
                setContactLoading(false)
              }
            }}
          >
            <h3 className="text-lg font-semibold text-surface-900">Talk to our team</h3>
            <p className="mt-1 text-sm text-surface-600">
              Share a few details and your enquiry will be recorded for the WAFLO team. We reply by email, usually
              the same working day.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-surface-700">
                Your name
                <input name="name" autoComplete="name" required className="input mt-1" />
              </label>
              <label className="block text-sm font-medium text-surface-700">
                Business name
                <input name="business" autoComplete="organization" className="input mt-1" />
              </label>
              <label className="block text-sm font-medium text-surface-700">
                Email address
                <input name="email" type="email" autoComplete="email" required className="input mt-1" />
              </label>
              <label className="block text-sm font-medium text-surface-700">
                WhatsApp number <span className="font-normal text-surface-400">(optional)</span>
                <input name="whatsapp" type="tel" autoComplete="tel" className="input mt-1" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-surface-700">
              How can we help?
              <textarea
                name="message"
                required
                rows={4}
                className="input mt-1 resize-y"
                placeholder="Tell us about your business and what you’d like to explore."
              />
            </label>
            {!contactSubmitted ? (
              <>
                <button
                  type="submit"
                  disabled={contactLoading}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-500 disabled:opacity-60"
                >
                  {contactLoading ? 'Sending…' : 'Send message'}
                </button>
                {contactError && <p className="mt-2 text-xs text-danger-600">{contactError}</p>}
                <p className="mt-2 text-xs leading-relaxed text-surface-400">
                  The team can review your enquiry in the platform support inbox.
                </p>
              </>
            ) : (
              <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-700">
                Thanks! We received your message and will be in touch shortly.
              </div>
            )}
          </form>
        </div>
      </section>

      {/* Footer */}
    </MarketingLayout>
  )
}
