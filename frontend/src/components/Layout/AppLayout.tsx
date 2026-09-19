import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)
  const closeSidebar = () => setIsSidebarOpen(false)

  return (
    <div className="min-h-screen min-h-[100dvh] bg-surface-50">
      <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} onNavigate={closeSidebar} />
      <div className="lg:pl-60 transition-all duration-200">
        <Topbar isSidebarOpen={isSidebarOpen} onSidebarToggle={toggleSidebar} />
        <main className="px-4 py-4 pb-24 sm:p-4 lg:p-6 lg:pb-6 max-w-[1600px] mx-auto">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  )
}

function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-surface-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        <MobileNavItem to="/dashboard" label="Home" icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        <MobileNavItem to="/inbox" label="Inbox" icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-3.46-.36L3 20l1.36-4.54A9 9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        <MobileNavItem to="/leads" label="Leads" icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        <MobileNavItem to="/handoffs" label="Tasks" icon="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a4 4 0 110-8 4 4 0 010 8z" />
        <MobileNavItem to="/settings" label="More" icon="M4 6h16M4 12h16M4 18h16" />
      </div>
    </nav>
  )
}

function MobileNavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
          isActive ? 'text-primary-700' : 'text-surface-500 hover:text-surface-800'
        }`
      }
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={icon} />
      </svg>
      <span className="leading-none">{label}</span>
    </NavLink>
  )
}