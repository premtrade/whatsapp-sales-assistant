/**
 * The demo tenant's content.
 *
 * The demo is a showcase instance of ROLINJ.IO - the same business, the same
 * services, the same knowledge base - running on a tenant of its own so that
 * nothing a real customer has written can ever be published.
 *
 * The knowledge base is not written here. It is copied from the live
 * ROLINJ.IO tenant on every seed, so the demo and the agent a visitor
 * messages on WhatsApp can never drift apart.
 *
 * Note on pricing: ROLINJ.IO's knowledge profile is explicit that no
 * published prices exist and that the assistant must never make up a figure.
 * The demo therefore shows the assistant declining to quote and offering a
 * discovery call, which is exactly what the live agent does.
 */

export const DEMO_SLUG = 'waflo-demo'

/** The tenant the demo's knowledge base is copied from. */
export const SOURCE_SLUG = 'rolinj-io'

export const BUSINESS = {
  name: 'ROLINJ.IO - Automation & AI Solutions',
  slug: DEMO_SLUG,
  description:
    'AI systems and business automations that replace repetitive work, connect your tools and capture revenue. Built in Jamaica for the Caribbean.',
  email: 'premtrade_ja@outlook.com',
  phone: '18767998637',
  website: 'https://rolin-io.vercel.app',
  address: '',
  currency: 'JMD',
  timezone: 'America/Jamaica',
  /**
   * The demo tenant's own placeholder. It is never published - the number a
   * visitor can message comes from DEMO_AGENT_WHATSAPP_NUMBER, and
   * businesses.whatsapp_phone is unique, so the demo tenant cannot hold the
   * live number as well.
   */
  whatsapp_phone: '+18765550100',
  waha_session_name: 'waha-waflo-demo',
}

/**
 * ROLINJ.IO's own plans. Prices are deliberately absent: the knowledge base
 * says no prices have been confirmed, and the assistant is not allowed to
 * invent one.
 */
export const PRODUCTS = [
  {
    sku: 'ROLINJ-STARTER',
    name: 'Starter',
    description:
      'For small teams. Basic automations, email and WhatsApp notifications, a monthly report, and up to three workflows.',
    category: 'Plans',
    unit: 'plan',
    price: 0,
  },
  {
    sku: 'ROLINJ-PRO',
    name: 'Pro',
    description:
      'For growing SMEs. Everything in Starter, plus CRM automation, invoice automation and the AI Document Assistant.',
    category: 'Plans',
    unit: 'plan',
    price: 0,
  },
  {
    sku: 'ROLINJ-SUITE',
    name: 'Digital Transformation Suite',
    description:
      'For businesses ready to scale. Full-stack automation, every workflow included, priority support and custom integrations.',
    category: 'Plans',
    unit: 'plan',
    price: 0,
  },
]

export const CONTACTS = [
  {
    key: 'priya',
    phone: '+18765550211',
    display_name: 'Priya Ramsook',
    company: 'Sunrise Pharmacy',
    tags: ['pharmacy', 'invoicing', 'payment-reminders'],
    notes: 'Runs a pharmacy in Portmore. Invoicing and chasing overdue accounts by hand.',
  },
  {
    key: 'michael',
    phone: '+18765550212',
    display_name: 'Michael Barrett',
    company: 'Barrett Hardware',
    tags: ['crm', 'sales-automation', 'whatsapp'],
    notes: 'Hardware supplier. Leads arrive across WhatsApp and email and nobody follows up.',
  },
  {
    key: 'denise',
    phone: '+18765550213',
    display_name: 'Denise Fletcher',
    company: null,
    tags: ['hr', 'onboarding', 'documents'],
    notes: 'Growing services company onboarding staff by hand.',
  },
  {
    key: 'andre',
    phone: '+18765550214',
    display_name: 'Andre Watson',
    company: 'Watson Logistics',
    tags: ['dashboards', 'reporting', 'evaluation'],
    notes: 'Asked for a dashboard demo. Comparing providers.',
  },
]

/**
 * The proposal the assistant sent in the showcase conversation.
 *
 * The figure is zero on purpose: ROLINJ.IO publishes no prices, so the quote
 * carries a real scope and a price that follows the written proposal. The
 * document is real, the number is not invented.
 */
export const PRIYA_QUOTE = {
  number: 'ROL-2026-0207',
  fileName: 'ROLINJ-Quote-0207.pdf',
  product: 'ROLINJ-PRO',
  lineItem: 'Accounting & Invoicing automation - priced after discovery',
  notes:
    'Accounting and invoicing automation: invoice generation from the existing records, payment reminders with customer-friendly messaging, receipt tracking, monthly email reporting, and Odoo Accounting integration where it is already in use. Scope, deliverables, timeline and payment milestones are set in the written proposal; the figure depends on the data and the number of systems connected.',
}

/**
 * The showcase conversation: a real shape of enquiry, answered the way the
 * live agent answers - from the knowledge base, without inventing a price.
 *
 * The thread runs the whole way a real enquiry runs: the question, the
 * answer, the booking, the discovery call, and the written proposal that
 * follows it. The last message carries the proposal document, because a
 * quote the assistant actually produced is the thing a prospect most wants
 * to see.
 */
export const PRIYA_THREAD = [
  {
    direction: 'incoming',
    sender_type: 'customer',
    minutes_ago: 60 * 24 * 2 + 120,
    text: "Hi, I run a pharmacy in Portmore. We're still doing invoices by hand in a spreadsheet and chasing overdue customers takes me most of a day every month. Can you automate that?",
  },
  {
    direction: 'outgoing',
    sender_type: 'ai',
    minutes_ago: 60 * 24 * 2 + 119,
    text: "Good afternoon. You're speaking with ROLINJ.IO - Automation & AI Solutions.\n\nYes - that sits inside our Accounting & Invoicing service: automated invoice generation, payment reminders with customer-friendly messaging, receipt tracking, monthly email reports, and Odoo Accounting integration where you already run it.\n\nOne thing I won't do is quote you a figure before I've seen the workflow, because the price depends on the tools you're on, how much data needs cleaning up and how many systems we connect. What we do first is a short discovery call to map the process, then a workflow review, and you get a written quote with scope, deliverables, timeline and payment milestones.\n\nCan I book you in for a free consultation?",
  },
  {
    direction: 'incoming',
    sender_type: 'customer',
    minutes_ago: 60 * 24 * 2 + 60,
    text: 'Yes please. What do you need from me to make the call useful?',
  },
  {
    direction: 'outgoing',
    sender_type: 'ai',
    minutes_ago: 60 * 24 * 2 + 59,
    text: "Booked. You'll get a calendar invite with the time, and a short note on what to have ready: a sample of your current invoices, who signs off on them, and where the overdue balances live. Anything you can't get to, that's fine too.",
  },
  {
    direction: 'incoming',
    sender_type: 'customer',
    minutes_ago: 60 * 24 * 2 + 12,
    text: 'That was really helpful, thank you. Please send the written proposal with the scope and the payment milestones.',
  },
  {
    direction: 'outgoing',
    sender_type: 'ai',
    minutes_ago: 60 * 24 * 2 + 11,
    document: true,
    quote_number: PRIYA_QUOTE.number,
    file_name: PRIYA_QUOTE.fileName,
    text: "Sending the written proposal now. It sets out the scope, deliverables, timeline and payment milestones for the invoice generation and payment-reminder workflow, and it is valid for 30 days.\n\nThe figure is in the proposal. There is no number in this chat because I do not have one yet - it depends on what is in your spreadsheet and how many customers need chasing. The next consultation is on the invite, and we can go through the proposal line by line.",
  },
]

export const OTHER_THREADS = {
  michael: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 8,
      text: 'Leads come in on WhatsApp and email and nobody ever follows up. Can you fix that?',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 8 - 1,
      text: "Good afternoon. You're speaking with ROLINJ.IO - Automation & AI Solutions.\n\nThat is our CRM & Sales Automation service: lead capture from every channel, a pipeline your team can actually see, automated follow-ups, WhatsApp and email notifications, and Odoo CRM integration if that is where your records live.\n\nPricing depends on the pipeline, the channels and the follow-up logic, so I would rather map it with you than guess. We can start with a free consultation and a written automation roadmap.",
    },
  ],
  denise: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 5,
      text: 'Onboarding new staff takes me two full days every time. Can that be automated?',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 5 - 1,
      text: "Good afternoon. You're speaking with ROLINJ.IO - Automation & AI Solutions.\n\nYes - our Operations Workflows service covers HR onboarding automation, employee notifications, approval request flows and task delegation, and our AI Document Assistant can answer questions against your own handbooks and contracts.\n\nI would need to see the current process before I commit to a figure. A short discovery call and a workflow review is the fastest way to get you an accurate quote.",
    },
  ],
  andre: [
    {
      direction: 'incoming',
      sender_type: 'customer',
      minutes_ago: 60 * 24 * 2,
      text: 'Do you have anything that shows revenue and customer activity without me building a report every week?',
    },
    {
      direction: 'outgoing',
      sender_type: 'ai',
      minutes_ago: 60 * 24 * 2 - 1,
      text: "Good afternoon. You're speaking with ROLINJ.IO - Automation & AI Solutions.\n\nThat is our Dashboards & Reporting service: revenue trends, customer activity tracking, team performance metrics, and automated daily or weekly reports so nothing has to be compiled by hand.\n\nWe can show you a free consultation and a sample roadmap for your business, and we will tell you honestly if this is not worth doing for you yet.",
    },
  ],
}

/**
 * The assistant's operating instructions for the demo tenant.
 *
 * They mirror the rules in ROLINJ.IO's own knowledge profile: answer only from
 * confirmed information, never invent a price, and escalate what is not
 * covered.
 */
export const AI_PROMPT = `You are the WhatsApp assistant for ROLINJ.IO - Automation & AI Solutions, an automation and AI provider for small and medium businesses in Jamaica and the wider Caribbean.

Answer only from the business knowledge base. It contains the service catalogue, the process we follow, the technology we build on, and our contact details.

Never invent a price. No published prices exist, so say that pricing depends on the workflow, the tools and the integrations, and offer a free consultation instead. Never invent discounts, delivery dates, business hours, addresses, payment terms, warranties, or coverage of any parish or country.

Keep it short: what we can do, what we need to know before quoting, and the next step. Offer the free consultation, which is how every engagement starts.

If a question is not covered by the knowledge base, say so plainly and offer to pass it to the team. Never repeat a public marketing claim as a guaranteed result for one customer.

Make clear that you are an AI assistant in your first reply.`
