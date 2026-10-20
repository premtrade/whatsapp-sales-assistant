import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

export type SiteLink = {
  label: string
  to: string
  /** Section id on the page, used to highlight the link while scrolling. */
  section?: string
}

export const SITE_LINKS: SiteLink[] = [
  { label: 'Features', to: '/#features', section: 'features' },
  { label: 'How It Works', to: '/#how-it-works', section: 'how-it-works' },
  { label: 'Pricing', to: '/#pricing', section: 'pricing' },
  { label: 'Live demo', to: '/demo' },
  { label: 'Blog', to: '/blog' },
  { label: 'FAQ', to: '/#faq', section: 'faq' },
]

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2.5 shrink-0" aria-label="WAFLO home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-600 shadow-sm shadow-primary-600/25">
        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-surface-900">WAFLO</span>
    </Link>
  )
}

/**
 * The site header.
 *
 * One header for the whole site, so the landing page and the inner pages
 * behave the same. It gains a solid background once the page is scrolled,
 * highlights the section you are reading, and - on small screens - opens a
 * menu instead of hiding the navigation entirely.
 */
export default function SiteHeader({
  links = SITE_LINKS,
  children,
}: {
  links?: SiteLink[]
  children?: ReactNode
}) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  // Highlight the section currently in view.
  useEffect(() => {
    const sections = links.map((l) => l.section).filter((id): id is string => Boolean(id))
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveSection(visible.target.id)
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: [0.05, 0.25, 0.5] }
    )

    for (const id of sections) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [links])

  // Lock the page behind the mobile menu.
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  const renderLink = (link: SiteLink, onClick?: () => void, className?: string) => {
    const isActive = Boolean(link.section) && activeSection === link.section
    if (link.to.startsWith('/#') || link.to.startsWith('#')) {
      return (
        <a
          href={link.to}
          onClick={onClick}
          className={className}
          aria-current={isActive ? 'true' : undefined}
        >
          {link.label}
        </a>
      )
    }
    return (
      <Link to={link.to} onClick={onClick} className={className}>
        {link.label}
      </Link>
    )
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-200 ${
        scrolled
          ? 'border-surface-200 bg-white/90 shadow-sm shadow-surface-900/5 backdrop-blur-md'
          : 'border-transparent bg-white/70 backdrop-blur-sm'
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Logo onClick={() => setMenuOpen(false)} />

          <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
            {links.map((link) =>
              renderLink(
                link,
                undefined,
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeSection === link.section
                    ? 'text-primary-700 bg-primary-50'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-50'
                }`
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            {children}
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-surface-600 transition-colors hover:text-surface-900 hover:bg-surface-50"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="hidden sm:inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary-600/25 transition-colors hover:bg-primary-500"
            >
              Start free trial
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="lg:hidden grid h-10 w-10 place-items-center rounded-lg text-surface-700 transition-colors hover:bg-surface-100"
            >
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation */}
      {menuOpen && (
        <div id="mobile-nav" className="lg:hidden border-t border-surface-200 bg-white shadow-lg">
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-4 sm:px-6 py-3 grid gap-1">
            {links.map((link) =>
              renderLink(
                link,
                () => setMenuOpen(false),
                `rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeSection === link.section
                    ? 'text-primary-700 bg-primary-50'
                    : 'text-surface-700 hover:bg-surface-50'
                }`
              )
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-surface-100 pt-3">
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border border-surface-200 px-3 py-2.5 text-center text-sm font-semibold text-surface-700"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg bg-primary-600 px-3 py-2.5 text-center text-sm font-semibold text-white"
              >
                Start free trial
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
