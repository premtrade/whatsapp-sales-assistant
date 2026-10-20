import MarketingLayout from '@/components/MarketingLayout'
import Seo from '@/components/Seo'
import { PRIVACY_SEO } from '@/seo/routes'

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <Seo config={PRIVACY_SEO} />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Legal</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-surface-950">Privacy Policy</h1>
        <p className="mt-4 text-sm text-surface-500">
          Applies to WAFLO and to the website at this address. WAFLO is operated by ROLINJ.IO, Kingston,
          Jamaica.
        </p>

        <div className="mt-10 space-y-10 text-base leading-7 text-surface-700">
          <section>
            <h2 className="text-xl font-semibold text-surface-900">What this covers</h2>
            <p className="mt-3">
              WAFLO is a multi-tenant service. Each business account is a separate tenant. Data submitted
              through one business account is not visible to another business account, and it is not used to
              build another tenant&apos;s results.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">What we collect</h2>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong className="text-surface-900">Account and business details.</strong> Business name,
                slug, owner name, email address, WhatsApp business number, operating hours, timezone and
                currency, supplied during signup or in Settings.
              </li>
              <li>
                <strong className="text-surface-900">WhatsApp conversations.</strong> Messages sent to and
                from your connected business number, plus the contact name and number associated with each
                conversation.
              </li>
              <li>
                <strong className="text-surface-900">Knowledge base content.</strong> The documents, price
                lists and FAQs you upload, and the text chunks and vector embeddings derived from them.
              </li>
              <li>
                <strong className="text-surface-900">Sales records.</strong> Quotes, appointments, lead
                scores, handoffs, follow-ups and conversation notes created for your business.
              </li>
              <li>
                <strong className="text-surface-900">Technical data.</strong> Authentication records, audit
                logs of dashboard activity, and IP address and browser user agent recorded on public enquiry
                and support forms.
              </li>
              <li>
                <strong className="text-surface-900">Billing records.</strong> Subscription status, plan,
                and payment references. Full card details are handled by our payment processor and are not
                stored by us.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">Processors we use</h2>
            <p className="mt-3">
              Your content is processed by the infrastructure required to generate and retrieve replies. The
              current list is:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong className="text-surface-900">WhatsApp</strong> — to deliver and receive messages on
                your connected business number.
              </li>
              <li>
                <strong className="text-surface-900">Our AI model provider</strong> — to generate assistant
                replies from your knowledge base and conversation context.
              </li>
              <li>
                <strong className="text-surface-900">Our embedding provider</strong> — to convert your
                uploaded documents into vector embeddings so relevant passages can be retrieved.
              </li>
              <li>
                <strong className="text-surface-900">Our hosting and database providers</strong> — to run
                the application, store your tenant data, and cache session state.
              </li>
              <li>
                <strong className="text-surface-900">Our email provider</strong> — to deliver transactional
                messages such as trial reminders and support responses.
              </li>
              <li>
                <strong className="text-surface-900">Our payment processor</strong> — to take subscription
                payments and manage the customer billing portal.
              </li>
              <li>
                <strong className="text-surface-900">Your CRM, if you connect one</strong> — for example an
                Odoo instance. Connections are optional, initiated by you, and scoped to the records you
                choose to sync.
              </li>
            </ul>
            <p className="mt-3">
              Each provider handles data under its own terms and privacy policy. We configure these services
              for business use; you should review the provider terms that apply to your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">AI disclosure</h2>
            <p className="mt-3">
              WAFLO replies to customers on your behalf using an AI assistant. The assistant is configured
              to make clear that it is an automated assistant rather than a person. You remain responsible
              for the accuracy of the business information you supply and for reviewing replies in the
              dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">How long we keep data</h2>
            <p className="mt-3">
              We keep your data for as long as your subscription is active, and for a short period after
              cancellation so that an account can be restored. Audit logs are retained according to the
              retention period configured for your account. On request we will export or delete your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">Access and security</h2>
            <p className="mt-3">
              Access to tenant data is restricted to the staff accounts of your business, to the platform
              owner role where operationally required, and to the support team when you ask for help. Every
              access is written to an audit log. Data in transit is encrypted, and secrets and credentials
              are held in the environment rather than in the application code.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">Your choices</h2>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>Request an export of your conversations, contacts, quotes and documents.</li>
              <li>Request deletion of your account and data.</li>
              <li>Disconnect a CRM integration or revoke a staff account at any time from Settings.</li>
              <li>Ask what processors currently touch your data.</li>
            </ul>
            <p className="mt-3">
              Contact{' '}
              <a href="mailto:premtrade_ja@outlook.com" className="text-primary-700 hover:underline">
                premtrade_ja@outlook.com
              </a>{' '}
              or call{' '}
              <a href="tel:+18767998637" className="text-primary-700 hover:underline">
                +1 (876) 799-8637
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-surface-900">Changes</h2>
            <p className="mt-3">
              If this policy changes materially, we will update this page and notify account administrators
              by email before the change takes effect.
            </p>
          </section>
        </div>
      </div>
    </MarketingLayout>
  )
}
