import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import SiteHeader, { SITE_LINKS, type SiteLink } from './SiteHeader'

function MarketingFooter() {
  return (
    <footer className="border-t border-surface-200 bg-surface-950 text-surface-400">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-600">
                <svg className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.6}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </span>
              <span className="text-lg font-bold text-white">WAFLO</span>
            </div>
            <p className="text-sm leading-relaxed">
              A managed AI sales assistant for WhatsApp. Built for service businesses that want to close more
              jobs with less admin.
            </p>
            <p className="mt-4 text-sm leading-relaxed">
              WAFLO is a product of ROLINJ.IO.
              <br />
              Kingston, Jamaica
              <br />
              <a href="mailto:premtrade_ja@outlook.com" className="hover:text-white">
                premtrade_ja@outlook.com
              </a>
              <br />
              <a href="tel:+18767998637" className="hover:text-white">
                +1 (876) 799-8637
              </a>
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/#features" className="hover:text-white">Features</Link></li>
              <li><Link to="/#pricing" className="hover:text-white">Pricing</Link></li>
              <li><Link to="/demo" className="hover:text-white">Live demo</Link></li>
              <li><Link to="/blog" className="hover:text-white">Blog</Link></li>
              <li><Link to="/faq" className="hover:text-white">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/blog/setup-whatsapp" className="hover:text-white">Set up WAFLO</Link></li>
              <li><Link to="/blog/business-knowledge" className="hover:text-white">Build your knowledge base</Link></li>
              <li><Link to="/blog/who-waflo-fits" className="hover:text-white">Is WAFLO a fit?</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/privacy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-white">Terms of Service</Link></li>
              <li><a href="mailto:premtrade_ja@outlook.com" className="hover:text-white">Contact us</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-8 border-t border-surface-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-surface-500">
            © 2026 WAFLO by ROLINJ.IO. All rights reserved. WAFLO is a proprietary managed service.
          </p>
          <p className="text-xs text-surface-500">
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <span className="mx-2">·</span>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full bg-surface-900 text-white shadow-lg shadow-surface-900/20 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  )
}

export function MarketingLayout({
  children,
  links = SITE_LINKS,
}: {
  children: ReactNode
  links?: SiteLink[]
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader links={links} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
      <BackToTop />
    </div>
  )
}

export { MarketingFooter }
export default MarketingLayout
