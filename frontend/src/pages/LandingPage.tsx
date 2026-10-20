import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { submitContactInquiry, getPlans } from '@/services/api'
import Seo from '@/components/Seo'
import { MarketingFooter } from '@/components/MarketingLayout'
import { getStaticPlans } from '@/seo/staticPlans'
import { LANDING_SEO } from '@/seo/routes'
import type { Plan } from '@/types'

const whatsappGreen = '#25D366'
const whatsappDark = '#075E54'

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: 'Live WhatsApp Inbox',
    description: 'Every message in one place. See conversations as they happen, with full customer context and AI notes.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'AI Responses 24/7',
    description: 'Groq LLM + your knowledge base means accurate, on-brand answers even at midnight.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: 'Lead Scoring',
    description: 'Automatic 0–100 score from budget, urgency, project type, location, and engagement.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'PDF Quotes to WhatsApp',
    description: 'Branded quotes generated and delivered in seconds. No more back-and-forth emails.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Appointments & Reminders',
    description: 'Book consultations, site visits, and follow-ups with conflict detection and auto-reminders.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Smart Handoffs',
    description: 'The AI knows when a lead needs a human. Warm handoffs with full conversation context.',
  },
]

const problems = [
  {
    emoji: '⏰',
    headline: 'Missed messages = missed jobs',
    copy: 'A customer WhatsApps at 8 PM. You’re on a job site. They call a competitor. Gone. Forever.',
  },
  {
    emoji: '📋',
    headline: 'Quotes take hours',
    copy: 'Typing PDFs, calculating totals, waiting for replies. Your competition is sending quotes in 30 seconds.',
  },
  {
    emoji: '🤷',
    headline: 'No idea who’s serious',
    copy: 'Some people just want a price. Some are ready to book. Without lead scoring, you waste time on tire-kickers.',
  },
  {
    emoji: '📞',
    headline: 'Follow-ups fall through',
    copy: 'You meant to follow up with that lead from last week. You forgot. They hired someone else.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Connect WhatsApp',
    copy: 'Link your WhatsApp Business number. We handle the integration via WAHA.',
  },
  {
    num: '02',
    title: 'Train Your AI',
    copy: 'Upload your services, pricing, and FAQs. The AI learns your business in minutes.',
  },
  {
    num: '03',
    title: 'Go Live',
    copy: 'Turn it on. The AI qualifies leads, sends quotes, and books appointments while you work.',
  },
]

const guarantees = [
  {
    title: 'It will not invent a price',
    copy: 'Quotes are priced from your own product list, not from the model. If it cannot find a price it tells the customer and offers a person.',
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
    copy: 'When a request needs judgement — a complaint, an approval, an unusual job — it hands off with a summary of what the customer asked for.',
  },
]

const fitPoints = [
  {
    title: 'Your own knowledge base',
    copy: 'Load your services, price list and FAQs. The assistant answers from those documents and from the conversation history — not from a generic script.',
  },
  {
    title: 'Your team stays in control',
    copy: 'Every AI reply is visible in the inbox with the lead score beside it. Take over a conversation in one tap, and keep the thread in WhatsApp where the customer expects it.',
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
    a: 'No. It’s powered by Groq LLM with your business knowledge base. Customize the tone to match your brand.',
  },
  {
    q: 'What if the AI can’t answer a question?',
    a: 'Smart handoff. When it detects a complex question or a ready-to-buy lead, it escalates to your team with full context.',
  },
  {
    q: 'Can I use my existing WhatsApp Business number?',
    a: 'Yes. We integrate via WAHA, which connects to your existing WhatsApp Business account. No new number needed.',
  },
  {
    q: 'Is my data secure?',
    a: 'Your data is stored on our servers and scoped to your business, so other tenants never see it. Replies and document retrieval are processed by the AI and embedding providers listed in our Privacy Policy.',
  },
  {
    q: 'Do customers know they are talking to an AI?',
    a: 'Yes. WAFLO is configured to say so in the first reply. An owner whose customers think they are talking to a person when they are not is exposed when the limitation shows.',
  },
  {
    q: 'What does a subscription cost on top of WhatsApp fees?',
    a: 'Each plan includes a set number of AI replies per month, shown on the pricing table. WhatsApp conversation charges from Meta are separate and passed through, so your total depends on your message volume. Ask us and we will model it for you before you commit.',
  },
  {
    q: 'What if I want to run this on my own servers?',
    a: 'WAFLO is a managed service. We run the application, the WhatsApp connection, the AI pipeline and the updates, and you use it from your browser.',
  },
]

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [contactSubmitted, setContactSubmitted] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(getStaticPlans())
  const [plansLoading, setPlansLoading] = useState(getStaticPlans() === null)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [demoAgentNumber, setDemoAgentNumber] = useState<string | null>(null)

  // The live demo agent's number, when one has been paired to the demo
  // tenant. The API only returns it once a real number is connected, so a
  // visitor is never sent to a placeholder.
  useEffect(() => {
    let cancelled = false
    fetch('/api/demo')
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && body?.success && body?.data?.business?.whatsappPhone) {
          setDemoAgentNumber(body.data.business.whatsappPhone)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch pricing plans from backend API so the public page always agrees with enforcement.
  // When plans were captured at build time (prerender) they are already in state and the
  // live fetch still runs afterwards to pick up any change.
  useEffect(() => {
    let cancelled = false
    async function loadPlans() {
      try {
        const data = await getPlans()
        if (!cancelled) {
          setPlans(data)
          setPlansLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setPlansError('Unable to load plans. Please refresh.')
          setPlansLoading(false)
        }
      }
    }
    loadPlans()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <Seo config={LANDING_SEO} />
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-surface-900">WAFLO</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-surface-600">
              <a href="#features" className="hover:text-surface-900">Features</a>
              <a href="#how-it-works" className="hover:text-surface-900">How It Works</a>
              <a href="#pricing" className="hover:text-surface-900">Pricing</a>
              <Link to="/blog" className="hover:text-surface-900">Blog</Link>
              <a href="#faq" className="hover:text-surface-900">FAQ</a>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm font-medium text-surface-600 hover:text-surface-900">
                Sign In
              </Link>
              <Link to="/signup" className="btn-primary text-sm py-2 px-4">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-semibold uppercase tracking-wide mb-6">
                <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                Now with AI-powered lead scoring
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-950 leading-[1.1] tracking-tight">
                Your WhatsApp Inbox Is a Sales Pipeline.
                <span className="text-primary-600"> Stop Letting It Slip.</span>
              </h1>
              <p className="mt-6 text-lg text-surface-600 leading-relaxed max-w-xl">
                WAFLO is an AI-powered sales assistant that qualifies leads, sends quotes, and books appointments — 24/7, right in WhatsApp. Built for construction, contracting, and service businesses.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link to="/signup" className="btn-primary text-center py-3 px-8 text-base">
                  Start Free Trial
                </Link>
                <Link to="/demo" className="btn-secondary text-center py-3 px-8 text-base">
                  See a real session
                </Link>
              </div>
              {demoAgentNumber && (
                <a
                  href={`https://wa.me/${demoAgentNumber.replace(/[^\d]/g, '')}?text=${encodeURIComponent("Hi! I'd like to know more about roofing services.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-600"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.585 0 11.946-5.359 11.949-11.945a11.87 11.87 0 00-3.421-8.4" />
                  </svg>
                  Or message our demo agent on WhatsApp
                </a>
              )}
              <div className="mt-6 flex items-center gap-6 text-sm text-surface-500">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  No credit card required
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  14-day free trial
                </span>
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cancel any time
                </span>
              </div>
              <p className="mt-4 text-xs text-surface-500 max-w-xl">
                Your customers are told they are talking to an AI assistant. You decide what it knows, and
                a person is always one tap away.
              </p>
            </div>
            <div className="relative">
              <div className="relative bg-white rounded-2xl shadow-2xl border border-surface-200 overflow-hidden">
                <div className="bg-surface-50 border-b border-surface-200 px-4 py-2.5 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                  <span className="text-xs font-medium text-surface-600">WhatsApp</span>
                  <span className="ml-auto text-xs text-surface-500">Harbour Point Roofing</span>
                </div>
                <img
                  src="/images/demo-conversation.jpg"
                  alt="A real WAFLO session: a customer asks for a quote for a 2,000 square foot roof in St. Andrew. The assistant prices it from the business price list, sends a quote and books a site visit for Thursday morning."
                  width={760}
                  height={900}
                  className="w-full h-auto block"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-primary-200 rounded-full blur-3xl opacity-40 -z-10" />
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-accent-200 rounded-full blur-3xl opacity-40 -z-10" />
            </div>
            <p className="mt-6 text-center text-xs text-surface-500">
              A real WAFLO session, recorded from a working tenant.
            </p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              You’re Losing Jobs Before You Even Quote Them.
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              Every missed WhatsApp message is a competitor’s closed deal. Here’s what happens when you don’t have WAFLO.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {problems.map((p) => (
              <div key={p.headline} className="bg-white rounded-2xl p-6 shadow-card border border-surface-200">
                <div className="text-3xl mb-4">{p.emoji}</div>
                <h3 className="text-base font-semibold text-surface-900 mb-2">{p.headline}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{p.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Live in 3 Steps
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              From signup to your AI sales rep in minutes. No engineers required.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.num} className="relative text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary-600 text-white flex items-center justify-center text-lg font-bold mx-auto mb-6">
                  {s.num}
                </div>
                <h3 className="text-xl font-semibold text-surface-900 mb-3">{s.title}</h3>
                <p className="text-surface-600 leading-relaxed max-w-sm mx-auto">{s.copy}</p>
                {s.num !== '03' && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-[80%] border-t-2 border-dashed border-surface-300" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Everything You Need to Close More Jobs From WhatsApp
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              From first message to booked job — WAFLO handles the sales work so you can focus on the work itself.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-card border border-surface-200 hover:shadow-card-hover hover:border-primary-200 transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-surface-900 mb-2">{f.title}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Your Sales Team’s Command Center
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              Real-time dashboard with live conversations, lead scores, quotes, appointments, and handoffs. No refreshing. No CSV exports.
            </p>
          </div>
          <div className="relative">
            <div className="bg-surface-900 rounded-2xl p-2 shadow-2xl">
              <div className="bg-surface-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-700">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs font-medium text-surface-400">WAFLO Dashboard</span>
                  <span className="ml-auto text-xs text-surface-500">Harbour Point Roofing — a working tenant</span>
                </div>
                <img
                  src="/images/demo-dashboard.jpg"
                  alt="The WAFLO dashboard for a roofing business: live conversations with lead scores, quotes sent, site visits booked and pipeline value, all in one screen."
                  width={1440}
                  height={1000}
                  className="w-full h-auto block"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-surface-500">
              The real dashboard, running on a live business.
            </p>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Built on Proven Technology. Run for You.
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              WAFLO is a managed service. We run the application, the WhatsApp connection, the AI pipeline
              and the updates — you use it from your browser and keep your customer conversations in WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {['Express', 'React', 'PostgreSQL', 'pgvector', 'Groq', 'Gemini', 'n8n', 'WAHA', 'Redis', 'Docker', 'TypeScript'].map((tool) => (
              <span key={tool} className="px-4 py-2 bg-white rounded-xl border border-surface-200 text-sm font-medium text-surface-700 shadow-sm">
                {tool}
              </span>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-surface-600">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Managed by ROLINJ.IO
            </span>
            <a
              href="https://rolin-io.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-primary-700 transition-colors text-surface-600"
            >
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              https://rolin-io.vercel.app/
            </a>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Cancel any time
            </span>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {/* Guarantees — verifiable behaviour instead of customer testimonials */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              What the Assistant Will Never Do
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              You are handing a customer-facing agent your business name. These boundaries are built into the
              product — they are not just a promise on this page.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {guarantees.map((g) => (
              <div key={g.title} className="bg-white rounded-2xl p-6 shadow-card border border-surface-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-surface-900 mb-2">{g.title}</h3>
                    <p className="text-sm text-surface-600 leading-relaxed">{g.copy}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fit */}
      <section className="py-20 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Built for Service Businesses Like Yours
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              WAFLO is built around one assumption: your customers message you, and you are busy doing the
              actual work.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {fitPoints.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-card border border-surface-200">
                <h3 className="text-base font-semibold text-surface-900 mb-2">{f.title}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{f.copy}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link to="/signup" className="btn-primary inline-flex py-3 px-8 text-base">
              Start Free Trial
            </Link>
            <p className="mt-3 text-sm text-surface-500">
              Or read the setup guide first:{' '}
              <Link to="/blog/setup-whatsapp" className="text-primary-700 hover:underline">
                connect WhatsApp without SSH
              </Link>
            </p>
          </div>
        </div>
      </section>

       {/* Pricing */}
       <section id="pricing" className="py-20 bg-surface-50">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center max-w-3xl mx-auto mb-16">
             <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
               Simple Pricing for Growing Businesses
             </h2>
             <p className="mt-4 text-lg text-surface-600">
               Start free. Upgrade when you're ready. No hidden fees.
             </p>
           </div>
           {plansLoading ? (
             <div className="text-center py-12">
               <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent"></div>
               <p className="mt-4 text-sm text-surface-500">Loading plans...</p>
             </div>
           ) : plansError ? (
             <div className="text-center py-12 text-surface-600">
               <p>{plansError}</p>
               <p className="mt-2 text-sm">Please refresh the page or try again later.</p>
             </div>
           ) : (
             <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
               {plans?.map((plan) => {
                 // Calculate yearly price if available, otherwise calculate from monthly
                 const yearlyPrice = plan.price_yearly || plan.price_monthly * 12;
                 const savings = yearlyPrice > 0
                   ? Math.round((1 - (plan.price_monthly * 12) / yearlyPrice) * 100)
                   : 0;

                 // Determine if this is the most popular (middle) plan
                 const isMostPopular = plan.sort_order === 2; // Professional plan

                 // Format limits for display
                 const aiResponses = plan.limits?.ai_responses ?? 0;
                 const aiResponsesDisplay = aiResponses === -1
                   ? 'Unlimited'
                   : aiResponses.toLocaleString() + ' AI responses/month';
                 const staffUsers = plan.limits?.staff_users ?? 0;
                 const staffUsersDisplay = staffUsers === -1
                   ? 'Unlimited'
                   : staffUsers.toString() + ' staff users';
                 const locations = plan.limits?.locations ?? 0;
                 const locationsDisplay = locations === -1
                   ? 'Unlimited'
                   : locations.toString() + ' locations';
                 const whatsappNumbers = plan.limits?.whatsapp_numbers ?? 0;
                 const whatsappNumbersDisplay = whatsappNumbers === -1
                   ? 'Unlimited'
                   : whatsappNumbers.toString() + ' WhatsApp numbers';

                 return (
                   <div
                     key={plan.slug}
                     className={`rounded-2xl p-6 ${isMostPopular ? 'bg-surface-900 text-white shadow-xl ring-1 ring-surface-700' : 'bg-white shadow-card border border-surface-200'}`}
                   >
                     {isMostPopular && (
                       <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-600 text-white text-xs font-semibold mb-4">
                         Most Popular
                       </div>
                     )}
                     <h3 className={`text-lg font-semibold ${isMostPopular ? 'text-white' : 'text-surface-900'}`}>
                       {plan.name}
                     </h3>
                     <div className="mt-4 flex items-baseline gap-1">
                       <span className={`text-4xl font-bold ${isMostPopular ? 'text-white' : 'text-surface-900'}`}>
                         ${plan.price_monthly}
                       </span>
                       <span className={`text-sm ${isMostPopular ? 'text-surface-300' : 'text-surface-500'}`}>
                         /month
                       </span>
                     </div>
                     <p className="mt-2 text-sm text-surface-500">
                       Save {savings}% with annual billing (${yearlyPrice}/year)
                     </p>
                     <ul className="mt-6 space-y-2">
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.ai_responses ? 'text-surface-600' : 'text-surface-400'}>
                           {aiResponsesDisplay}
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.pdf_quotes ? 'text-surface-600' : 'text-surface-400'}>
                           PDF quotes to WhatsApp
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.appointments ? 'text-surface-600' : 'text-surface-400'}>
                           Appointments & reminders
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.lead_scoring ? 'text-surface-600' : 'text-surface-400'}>
                           Lead scoring
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.knowledge_base ? 'text-surface-600' : 'text-surface-400'}>
                           Knowledge base
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.handoffs ? 'text-surface-600' : 'text-surface-400'}>
                           AI handoffs
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.multi_location ? 'text-surface-600' : 'text-surface-400'}>
                           Multi-location
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className={plan.features?.api_access ? 'text-surface-600' : 'text-surface-400'}>
                           API access
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className="text-surface-500">
                           {staffUsersDisplay}
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className="text-surface-500">
                           {locationsDisplay}
                         </span>
                       </li>
                       <li className="flex items-center gap-2 text-sm">
                         <svg className="w-4 h-4 shrink-0 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                         </svg>
                         <span className="text-surface-500">
                           {whatsappNumbersDisplay} <span className="text-xs text-surface-400">(WhatsApp charges may apply)</span>
                         </span>
                       </li>
                     </ul>
                      <Link
                        to="/signup"
                        className={`mt-6 block text-center py-2.5 px-4 rounded-xl text-sm font-semibold ${
                          isMostPopular
                            ? 'bg-primary-600 text-white hover:bg-primary-500'
                            : 'bg-surface-900 text-white hover:bg-surface-800'
                        }`}
                      >
                        Start Free Trial
                      </Link>
                   </div>
                 );
               })}
             </div>
           )}
            <div className="max-w-3xl mx-auto text-sm text-surface-600 space-y-2 mt-8">
              <p>
                One AI response is one reply the assistant sends to a customer. WhatsApp conversation charges
                from Meta are separate from our subscription and are passed through at cost — your total
                depends on your message volume. Ask us and we will model it for you before you commit.
              </p>
              <p className="text-surface-500">
                Prices in USD. Change or cancel your plan from the Billing page at any time.
              </p>
            </div>
         </div>
       </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-surface-200 shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-surface-900">{faq.q}</span>
                  <svg
                    className={`w-4 h-4 text-surface-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-surface-600 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-surface-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-start">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Ready to Stop Missing WhatsApp Leads?
            </h2>
            <p className="mt-4 text-lg text-surface-300 max-w-xl mx-auto lg:mx-0">
              Start your 14-day free trial, or tell us a little about your business and what you need.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link to="/signup" className="btn-primary py-3 px-8 text-base">
                Get Started Free
              </Link>
            </div>
            <p className="mt-6 text-sm text-surface-400">
              Prefer email?{' '}
              <a href="mailto:premtrade_ja@outlook.com" className="text-primary-400 hover:text-primary-300 underline underline-offset-4">
                premtrade_ja@outlook.com
              </a>
            </p>
          </div>
          <form
            className="bg-white rounded-xl p-6 sm:p-8 space-y-4"
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
            <div>
              <h3 className="text-xl font-semibold text-surface-900">Talk to our team</h3>
              <p className="mt-1 text-sm text-surface-600">Share a few details and your inquiry will be recorded for the WAFLO team. We reply by email, usually the same working day.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
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
            <label className="block text-sm font-medium text-surface-700">
              How can we help?
              <textarea name="message" required rows={4} className="input mt-1 resize-y" placeholder="Tell us about your business and what you’d like to explore." />
            </label>
              {!contactSubmitted ? (
                <>
                  <button type="submit" disabled={contactLoading} className="btn-primary w-full py-3 text-base">
                    {contactLoading ? 'Sending...' : 'Send message'}
                  </button>
                  {contactError && <p className="mt-2 text-xs text-red-600">{contactError}</p>}
                  <p className="mt-2 text-xs leading-relaxed text-surface-500">
                  The team can review your inquiry in the platform support inbox.
                  </p>
                </>
              ) : (
                <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                  Thanks! We received your message and will be in touch shortly.
                </div>
              )}
          </form>
        </div>
      </section>

      {/* Footer */}
      <MarketingFooter />
    </div>
  )
}
