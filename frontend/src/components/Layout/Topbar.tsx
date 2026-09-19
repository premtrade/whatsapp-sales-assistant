import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useWebSocket } from '@/context/WebSocketContext'

interface SearchResult {
  type: string
  title: string
  subtitle: string
  href: string
}

interface TopbarProps {
  isSidebarOpen: boolean
  onSidebarToggle: () => void
}

export function Topbar({ isSidebarOpen, onSidebarToggle }: TopbarProps) {
  const { staff } = useAuth()
  const { isConnected } = useWebSocket()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const statusLabel = isConnected ? 'Connected' : 'Disconnected'
  const statusColor = isConnected ? 'bg-success-500' : 'bg-danger-500'

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 lg:px-6 bg-white border-b border-surface-200">
      {/* Left side: Hamburger button (mobile only) */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSidebarToggle}
          className="lg:hidden p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="flex-1 min-w-0 max-w-xl" ref={searchRef}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search…"
            aria-label="Search conversations, customers, quotes"
            className="w-full min-w-0 pl-10 pr-9 py-2.5 text-base sm:text-sm border border-surface-200 rounded-lg bg-surface-50 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="w-4 h-4 text-surface-400 hover:text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Search dropdown */}
          {searchOpen && searchQuery.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-dropdown border border-surface-200 py-2 max-h-80 overflow-y-auto">
              <div className="px-3 py-1.5 text-xs font-medium text-surface-400 uppercase">Quick Results</div>
              <div className="px-3 py-8 text-center text-sm text-surface-400">
                Type to search customers, conversations, quotes...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 sm:gap-3 ml-2 sm:ml-4 shrink-0">
        {/* Connection status */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-50">
          <span className={`w-2 h-2 rounded-full ${statusColor} ${isConnected ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-medium text-surface-600">{statusLabel}</span>
        </div>

        {/* Notifications */}
        <button aria-label="Notifications" className="touch-target relative p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full" />
        </button>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1.5 hover:bg-surface-100 rounded-lg transition-colors touch-target"
            aria-label="Account menu"
            aria-expanded={showProfileMenu}
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold">
              {staff?.display_name?.charAt(0) || staff?.first_name?.charAt(0) || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-surface-800 leading-tight">{staff?.display_name || 'User'}</p>
              <p className="text-[10px] text-surface-400">{staff?.role || 'Staff'}</p>
            </div>
            <svg className="w-4 h-4 text-surface-400 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-dropdown border border-surface-200 py-1">
              <div className="px-3 py-2 border-b border-surface-100">
                <p className="text-sm font-medium text-surface-800">{staff?.display_name || 'User'}</p>
                <p className="text-xs text-surface-400">{staff?.email}</p>
              </div>
              <button
                onClick={() => setShowProfileMenu(false)}
                className="w-full px-3 py-2 text-left text-sm text-surface-600 hover:bg-surface-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 013-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}