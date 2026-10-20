import { useState, type FormEvent } from 'react'
import MarketingLayout from '@/components/MarketingLayout'
import Seo from '@/components/Seo'
import { createSupportTicket } from '@/services/api'
import { FAQ_ITEMS, FAQ_SEO } from '@/seo/routes'

type FaqItem = {
  question: string
  answer: string
  category: string
}

const faqs: FaqItem[] = FAQ_ITEMS

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
    <MarketingLayout>
      <Seo config={FAQ_SEO} />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Support</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-surface-950">
            Frequently asked questions
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-surface-600">
            Quick answers about setup, billing, AI behaviour, and how your data is handled.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-2xl border border-surface-200 bg-white p-5">
              <p className="text-xs font-medium text-primary-700 mb-1">{faq.category}</p>
              <h2 className="text-base font-semibold text-surface-900">{faq.question}</h2>
              <p className="mt-2 text-sm leading-relaxed text-surface-600">{faq.answer}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-surface-200 bg-surface-50 p-6">
          <h2 className="text-lg font-semibold text-surface-900">Still need help?</h2>
          <p className="mt-2 text-sm text-surface-600 mb-4">
            Send a request to the WAFLO team. It will be recorded in the platform support inbox and answered
            by email.
          </p>
          {submitted ? (
            <div role="status" className="rounded-lg border border-success-700 bg-success-50 p-4 text-sm text-success-700">
              Your request has been recorded. A confirmation will arrive in your inbox.
            </div>
          ) : (
            <form onSubmit={handleSupportSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-surface-700">
                Name
                <input name="name" required maxLength={255} autoComplete="name" className="input mt-1" />
              </label>
              <label className="text-xs text-surface-700">
                Email
                <input name="email" type="email" required maxLength={255} autoComplete="email" className="input mt-1" />
              </label>
              <label className="text-xs text-surface-700">
                Category
                <select name="category" className="input mt-1">
                  <option value="technical">Technical</option>
                  <option value="billing">Billing</option>
                  <option value="feature">Feature request</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-xs text-surface-700">
                Subject
                <input name="subject" required maxLength={255} className="input mt-1" />
              </label>
              <label className="text-xs text-surface-700 sm:col-span-2">
                How can we help?
                <textarea name="message" required rows={4} className="input mt-1" />
              </label>
              {error && <p role="alert" className="text-sm text-danger-600 sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
                <button type="submit" disabled={sending} className="btn-primary">
                  {sending ? 'Sending…' : 'Send support request'}
                </button>
                <a href="mailto:premtrade_ja@outlook.com" className="text-sm text-primary-700 hover:underline">
                  Or email premtrade_ja@outlook.com
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </MarketingLayout>
  )
}
