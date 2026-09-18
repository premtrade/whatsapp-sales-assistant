import type { ReactNode } from 'react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)

  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
      <div className="lg:pl-60 transition-all duration-200">
        <Topbar isSidebarOpen={isSidebarOpen} onSidebarToggle={toggleSidebar} />
        <main className="p-4 lg:p-6 max-w-[1600px] mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}