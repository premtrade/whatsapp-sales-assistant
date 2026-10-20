import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const navLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
]

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-surface-200">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 0112 3c4.97 0 9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-surface-900">WAFLO</span>
        </Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-6 text-sm font-medium text-surface-600">
          {navLinks.map((link) => (
            <Link key={link.label} to={link.href} className="hover:text-surface-900">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-surface-600 hover:text-surface-900">
            Sign In
          </Link>
          <Link to="/signup" className="btn-primary text-sm py-2 px-4">
            Start Free Trial
          </Link>
        </div>
      </div>
    </header>
  )
}

export function MarketingFooter() {
  return (
    <footer className="bg-surface-950 text-surface-400 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 0112 3c4.97 0 9 3.582 9 8z" />
                </svg>
              </div>
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
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/#features" className="hover:text-white">Features</Link></li>
              <li><Link to="/#pricing" className="hover:text-white">Pricing</Link></li>
              <li><Link to="/blog" className="hover:text-white">Blog</Link></li>
              <li><Link to="/faq" className="hover:text-white">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/blog/setup-whatsapp" className="hover:text-white">Set up WAFLO</Link></li>
              <li><Link to="/blog/business-knowledge" className="hover:text-white">Build your knowledge base</Link></li>
              <li><Link to="/blog/who-waflo-fits" className="hover:text-white">Is WAFLO a fit?</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/privacy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-white">Terms of Service</Link></li>
              <li><a href="mailto:premtrade_ja@outlook.com" className="hover:text-white">Contact us</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-surface-800 flex flex-col sm:flex-row justify-between items-center gap-4">
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

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
