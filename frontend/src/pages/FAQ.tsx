import { useState, type FormEvent } from 'react'
import { createSupportTicket } from '@/services/api'

type FaqItem = {
  question: string
  answer: string
  category: string
}

const faqs: FaqItem[] = [
  {
    category: 'Getting started',
    question: 'How do I connect my WhatsApp number?',
    answer: 'Go to Settings → WhatsApp in your dashboard, click Connect / Show QR Code, then open WhatsApp on your phone → Linked Devices → Link a Device and scan the QR code. No SSH is required.',
  },
  {
    category: 'Getting started',
    question: 'How long does setup take?',
    answer: 'Most users are up and running in about 20 minutes: signup, connect WhatsApp, upload a quick knowledge base, and send a test message.',
  },
  {
    category: 'Billing',
    question: 'What happens after my 14-day trial ends?',
    answer: 'Your trial enters a 3-day grace period with full access. After that, requests return a 402 until you upgrade. You can upgrade anytime from the Billing page.',
  },
  {
    category: 'Billing',
    question: 'Can I change plans later?',
    answer: 'Yes. Use the Billing page to switch plans at any time. Prorated charges may apply depending on your billing cycle.',
  },
  {
    category: 'AI & responses',
    question: 'Does the AI invent prices or quotes?',
    answer: 'No. The AI is instructed to answer only from your uploaded knowledge base. If the answer is not in the knowledge base, it will say so and offer to connect you with a human.',
  },
  {
    category: 'AI & responses',
    question: 'How accurate is the AI?',
    answer: 'Accuracy depends on your knowledge base. Upload current price lists, service guides, and FAQs for best results. You can review every AI reply in the inbox.',
  },
  {
    category: 'WhatsApp',
    question: 'Do I need a separate phone number?',
    answer: 'Yes. Use a number you can dedicate to the business. It must be available to scan the QR code during pairing.',
  },
  {
    category: 'WhatsApp',
    question: 'Can I use an existing WhatsApp Business number?',
    answer: 'Yes, as long as you can scan the QR code from that phone during setup.',
  },
  {
    category: 'Data & privacy',
    question: 'Where is my data stored?',
    answer: 'Your data is stored on secure servers. Conversations, contacts, and documents are scoped to your business and not shared with other tenants.',
  },
  {
    category: 'Data & privacy',
    question: 'Can I export my data?',
    answer: 'Yes. Contact support and we will help you export your conversations, contacts, and quotes.',
  },
]

export default function FAQPage() {
  const [sending, setSending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSupportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await createSupportTicket({
        name: String(form.get('name') || '').trim(),
        email: String(form.get('email') || '').trim(),
        category: String(form.get('category') || 'other') as 'technical' | 'billing' | 'feature' | 'other',
        subject: String(form.get('subject') || '').trim(),
        message: String(form.get('message') || '').trim(),
      })
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.message || 'Could not send your support request. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Frequently asked questions</h1>
        <p className="text-sm text-surface-400 mt-1">Quick answers to common questions about WAFLO.</p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-surface-900 border border-surface-800 rounded-xl p-5">
            <p className="text-xs font-medium text-primary-400 mb-1">{faq.category}</p>
            <h3 className="text-sm font-semibold text-surface-100">{faq.question}</h3>
            <p className="text-sm text-surface-300 mt-2 leading-relaxed">{faq.answer}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-surface-100 mb-2">Still need help?</h3>
        <p className="text-sm text-surface-300 mb-3">
          Send a request to the WAFLO team. It will be recorded in the platform support inbox.
        </p>
        {submitted ? (
          <div role="status" className="rounded-lg border border-success-800 bg-success-900/20 p-4 text-sm text-success-300">
            Your request has been recorded. If email is configured, a confirmation will arrive in your inbox.
          </div>
        ) : (
          <form onSubmit={handleSupportSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-surface-300">Name<input name="name" required maxLength={255} autoComplete="name" className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100" /></label>
            <label className="text-xs text-surface-300">Email<input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100" /></label>
            <label className="text-xs text-surface-300">Category<select name="category" className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100"><option value="technical">Technical</option><option value="billing">Billing</option><option value="feature">Feature request</option><option value="other">Other</option></select></label>
            <label className="text-xs text-surface-300">Subject<input name="subject" required maxLength={255} className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100" /></label>
            <label className="text-xs text-surface-300 sm:col-span-2">How can we help?<textarea name="message" required rows={4} className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-surface-100" /></label>
            {error && <p role="alert" className="text-sm text-danger-400 sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
              <button type="submit" disabled={sending} className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{sending ? 'Sending…' : 'Send support request'}</button>
              <a href="mailto:premtrade_ja@outlook.com" className="text-sm text-primary-400 hover:underline">Or email premtrade_ja@outlook.com</a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
