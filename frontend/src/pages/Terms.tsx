import MarketingLayout from '@/components/MarketingLayout'
import Seo from '@/components/Seo'
import { TERMS_SEO } from '@/seo/routes'

export default function TermsPage() {
  return (
    <MarketingLayout>
      <Seo config={TERMS_SEO} />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Legal</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-surface-950">Terms of Service</h1>
        <p className="mt-4 text-sm text-surface-500">
          These terms govern your use of WAFLO. WAFLO is operated by ROLINJ.IO, Kingston, Jamaica.
        </p>

        <div className="mt-10 space-y-10 text-base leading-7 text-surface-700">
          <section>
            <h2 className="text-xl font-semibold text-surface-900">1. The service</h2>
            <p className="mt-3">
              WAFLO is a managed software service that connects a business WhatsApp number to an AI
              assistant, and provides a web dashboard for reviewing conversations, leads, quotes,
              appointments and handoffs. WAFLO is licensed to you for your own business use. It is not
              resold, and the software is not distributed or licensed as open source.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">2. Accounts and access</h2>
            <p className="mt-3">
              You are responsible for the accuracy of your business information, for keeping staff account
              credentials confidential, and for removing access from staff who leave your business. You must
              be legally able to enter into this agreement and you must provide accurate registration
              details.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">3. Subscriptions and trial</h2>
            <p className="mt-3">
              New accounts start with a 14-day free trial, followed by a 3-day grace period. After the grace
              period, access to paid features requires an active subscription. Plans, included AI responses,
              staff seat and WhatsApp number limits are shown on the pricing page and enforced in the
              product. You can change plan or cancel from the Billing page at any time. WhatsApp
              conversation charges imposed by WhatsApp are separate from our subscription and are passed
              through.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">4. Your content</h2>
            <p className="mt-3">
              You keep all rights to the content you upload, including documents, price lists and FAQs. You
              grant us the limited licence needed to host, process and transmit that content in order to
              provide the service to you — for example, to embed your documents so they can be retrieved
              when a customer asks a question. We do not claim ownership of your business information or
              your customer conversations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">5. Acceptable use</h2>
            <p className="mt-3">
              You agree not to use WAFLO to send unsolicited bulk messages, to violate WhatsApp&apos;s terms
              or any applicable law, to impersonate a person or business other than your own, to upload
              content you do not have the right to use, or to attempt to access another business&apos;s
              account or data. We may suspend an account that puts the service, other tenants, or WhatsApp
              itself at risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">6. Your responsibility for AI replies</h2>
            <p className="mt-3">
              The assistant is configured to answer from the information you supply and to hand off to a
              person when it is unsure. Automated replies are not a guarantee that every request is
              understood or resolved. You are responsible for the business information you load, for
              reviewing replies, and for the commitments you make to your customers. WAFLO is not a
              substitute for professional advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">7. Availability and support</h2>
            <p className="mt-3">
              We work to keep the service available and to respond to support requests, but the service is
              provided on an as-available basis. We do not guarantee a specific uptime percentage, response
              time, or that the service will be uninterrupted. We may modify or discontinue features, and
              we will give reasonable notice before a change that materially reduces functionality you are
              paying for.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">8. Limitation of liability</h2>
            <p className="mt-3">
              To the maximum extent permitted by law, our aggregate liability arising out of or related to
              your use of WAFLO is limited to the subscription fees you paid in the twelve months preceding
              the event giving rise to the claim. We are not liable for indirect or consequential loss,
              including lost profits or lost sales. Nothing in these terms limits liability that cannot
              lawfully be limited.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">9. Term and changes</h2>
            <p className="mt-3">
              You may cancel at any time from the Billing page. If you do not cancel, your subscription
              renews on the billing cycle you selected. We may update these terms; material changes will be
              notified by email to account administrators before they take effect. Continuing to use the
              service after a change means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">10. Contact</h2>
            <p className="mt-3">
              Questions about these terms:{' '}
              <a href="mailto:premtrade_ja@outlook.com" className="text-primary-700 hover:underline">
                premtrade_ja@outlook.com
              </a>{' '}
              or{' '}
              <a href="tel:+18767998637" className="text-primary-700 hover:underline">
                +1 (876) 799-8637
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </MarketingLayout>
  )
}
