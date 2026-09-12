import { useState } from 'react'
import { Link } from 'react-router-dom'

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

const testimonials = [
  {
    quote: 'We used to miss 30% of our WhatsApp leads because we were on job sites. Now the AI qualifies them and sends quotes while we work. We’ve closed 15% more jobs in the first month.',
    name: 'Carlos M.',
    role: 'Roofing Contractor',
  },
  {
    quote: 'The lead scoring alone is worth it. I know exactly who’s ready to buy before I even pick up the phone.',
    name: 'Sarah K.',
    role: 'Plumbing Services',
  },
  {
    quote: 'Appointment bookings went up 40%. The AI handles the back-and-forth scheduling automatically.',
    name: 'James T.',
    role: 'Real Estate Agency',
  },
]

const faqs = [
  {
    q: 'Do I need technical skills to set this up?',
    a: 'No. Most businesses are live in 10 minutes. If you can use WhatsApp, you can use WAFLO.',
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
    a: 'Yes. SOC 2 compliant infrastructure, encrypted databases, and role-based access. Your data is never used to train AI models.',
  },
  {
    q: 'What if I want to self-host?',
    a: 'The open-source version is available. You can run it on your own servers with full control.',
  },
]

const pricingTiers = [
  {
    name: 'Starter',
    price: '79',
    unit: '/month',
    responses: '500 AI responses',
    users: '1 staff user',
    locations: '1 location',
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    name: 'Professional',
    price: '199',
    unit: '/month',
    responses: '2,000 AI responses',
    users: '5 staff users',
    locations: '3 locations',
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Business',
    price: '399',
    unit: '/month',
    responses: 'Unlimited responses',
    users: 'Unlimited users',
    locations: 'Unlimited locations',
    cta: 'Contact Sales',
    highlight: false,
  },
]

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white">
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
              <a href="#faq" className="hover:text-surface-900">FAQ</a>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm font-medium text-surface-600 hover:text-surface-900">
                Sign In
              </Link>
              <a href="#pricing" className="btn-primary text-sm py-2 px-4">
                Start Free Trial
              </a>
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
                <a href="#pricing" className="btn-primary text-center py-3 px-8 text-base">
                  Start Free Trial
                </a>
                <a href="#how-it-works" className="btn-secondary text-center py-3 px-8 text-base">
                  See How It Works
                </a>
              </div>
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
                  Setup in 10 minutes
                </span>
              </div>
            </div>
            <div className="relative">
              <div className="relative bg-white rounded-2xl shadow-2xl border border-surface-200 overflow-hidden">
                <div className="bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs font-medium text-surface-500">WAFLO Dashboard</span>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs shrink-0">AI</div>
                    <div className="bg-primary-50 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-surface-800 max-w-sm">
                      Hi! I’m interested in a new roof for my 2,000 sq ft house. Budget is around JMD 250,000. Can you send me a quote?
                    </div>
                  </div>
                  <div className="flex items-start gap-3 justify-end">
                    <div className="bg-surface-900 text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm max-w-sm">
                      <p className="mb-2">Thanks for reaching out! A 2,000 sq ft roof is a great fit for our standard shingle package.</p>
                      <p className="mb-2">📄 I’ve generated a quote for JMD 245,000 — sending it now.</p>
                      <p>📅 Would you like to schedule a site visit this week?</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-4 border-t border-surface-200">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Lead Score: 87/100
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold">
                      Status: Qualified
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold">
                      Quote Sent ✓
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-primary-200 rounded-full blur-3xl opacity-40 -z-10" />
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-accent-200 rounded-full blur-3xl opacity-40 -z-10" />
            </div>
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
          <div className="bg-surface-900 rounded-2xl p-2 shadow-2xl">
            <div className="bg-surface-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-700">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-2 text-xs font-medium text-surface-400">WAFLO Dashboard — Garco Construction</span>
              </div>
              <div className="p-6 grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-3 space-y-4">
                  <div className="bg-surface-700/50 rounded-xl p-4">
                    <div className="text-xs text-surface-400 mb-1">Today’s Conversations</div>
                    <div className="text-2xl font-bold text-white">24</div>
                    <div className="text-xs text-green-400 mt-1">↑ 18% vs yesterday</div>
                  </div>
                  <div className="bg-surface-700/50 rounded-xl p-4">
                    <div className="text-xs text-surface-400 mb-1">AI Responses</div>
                    <div className="text-2xl font-bold text-white">18</div>
                    <div className="text-xs text-surface-400 mt-1">6 handed to humans</div>
                  </div>
                  <div className="bg-surface-700/50 rounded-xl p-4">
                    <div className="text-xs text-surface-400 mb-1">Quotes Sent</div>
                    <div className="text-2xl font-bold text-white">5</div>
                    <div className="text-xs text-green-400 mt-1">JMD 1.2M total value</div>
                  </div>
                </div>
                <div className="col-span-12 md:col-span-9 bg-surface-700/30 rounded-xl p-4">
                  <div className="text-xs text-surface-400 mb-3">Live Conversation Feed</div>
                  <div className="space-y-3">
                    {[
                      { name: 'Maria G.', phone: '+1-876-555-0101', score: 92, status: 'Qualified', time: '2 min ago' },
                      { name: 'Desmond R.', phone: '+1-876-555-0102', score: 45, status: 'New', time: '8 min ago' },
                      { name: 'Patricia L.', phone: '+1-876-555-0103', score: 78, status: 'Quoted', time: '15 min ago' },
                    ].map((c) => (
                      <div key={c.phone} className="flex items-center justify-between bg-surface-700/50 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
                            {c.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{c.name}</div>
                            <div className="text-xs text-surface-400">{c.phone} · {c.time}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${c.status === 'Qualified' ? 'bg-green-900/30 text-green-400' : c.status === 'Quoted' ? 'bg-blue-900/30 text-blue-400' : 'bg-surface-600 text-surface-300'}`}>
                            {c.status}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${c.score >= 80 ? 'bg-green-900/30 text-green-400' : c.score >= 50 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                            {c.score}/100
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Built on Open Source. Trusted by Businesses.
            </h2>
            <p className="mt-4 text-lg text-surface-600">
              WAFLO is built with battle-tested open-source tools. No proprietary lock-in. Host it yourself or let us run it.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {['Express', 'React', 'PostgreSQL', 'pgvector', 'Qdrant', 'Groq', 'Gemini', 'n8n', 'WAHA', 'Redis', 'Docker', 'TypeScript'].map((tool) => (
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
              Self-hostable
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Open source core
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              SOC 2 compliant infrastructure
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              GDPR-ready
            </span>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 tracking-tight">
              Built for Service Businesses Like Yours
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-6 shadow-card border border-surface-200">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-surface-700 leading-relaxed mb-4">“{t.quote}”</p>
                <div>
                  <div className="text-sm font-semibold text-surface-900">{t.name}</div>
                  <div className="text-xs text-surface-500">{t.role}</div>
                </div>
              </div>
            ))}
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
              Start free. Upgrade when you’re ready. No hidden fees.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl p-6 ${tier.highlight ? 'bg-surface-900 text-white shadow-xl ring-1 ring-surface-700' : 'bg-white shadow-card border border-surface-200'}`}
              >
                {tier.highlight && (
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-600 text-white text-xs font-semibold mb-4">
                    Most Popular
                  </div>
                )}
                <h3 className={`text-lg font-semibold ${tier.highlight ? 'text-white' : 'text-surface-900'}`}>{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className={`text-4xl font-bold ${tier.highlight ? 'text-white' : 'text-surface-900'}`}>${tier.price}</span>
                  <span className={`text-sm ${tier.highlight ? 'text-surface-300' : 'text-surface-500'}`}>{tier.unit}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {[tier.responses, tier.users, tier.locations, 'PDF quotes', 'Appointments', 'Knowledge base', 'AI handoffs'].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <svg className={`w-4 h-4 shrink-0 ${tier.highlight ? 'text-primary-400' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={tier.highlight ? 'text-surface-200' : 'text-surface-600'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#"
                  className={`mt-8 block text-center py-2.5 px-4 rounded-xl text-sm font-semibold ${
                    tier.highlight
                      ? 'bg-primary-600 text-white hover:bg-primary-500'
                      : 'bg-surface-900 text-white hover:bg-surface-800'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-surface-500 mt-8">
            30-day money-back guarantee. No questions asked.
          </p>
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Ready to Stop Missing WhatsApp Leads?
          </h2>
          <p className="mt-4 text-lg text-surface-300 max-w-2xl mx-auto">
            Start your 14-day free trial. No credit card required. Setup in 10 minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login" className="btn-primary py-3 px-8 text-base">
              Get Started Free
            </Link>
            <a href="mailto:hello@waflo.com" className="btn-secondary py-3 px-8 text-base bg-transparent border-surface-600 text-white hover:bg-surface-800">
              Talk to Our Team
            </a>
          </div>
          <p className="mt-6 text-sm text-surface-400">
            Questions? Email us at{' '}
            <a href="mailto:hello@waflo.com" className="text-primary-400 hover:text-primary-300">
              hello@waflo.com
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-surface-950 text-surface-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <span className="text-lg font-bold text-white">WAFLO</span>
              </div>
              <p className="text-sm leading-relaxed">
                Your AI sales assistant for WhatsApp. Built for service businesses that want to close more jobs with less admin.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Integrations</a></li>
                <li><a href="#" className="hover:text-white">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Documentation</a></li>
                <li><a href="#" className="hover:text-white">API Reference</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Community</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">GDPR</a></li>
                <li><a href="#" className="hover:text-white">SOC 2</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-surface-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-surface-500">
              © 2026 WAFLO. Open source under MIT License. Built with ❤️ for service businesses.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-surface-400 hover:text-white">
                <span className="sr-only">GitHub</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              </a>
              <a href="#" className="text-surface-400 hover:text-white">
                <span className="sr-only">Twitter</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
