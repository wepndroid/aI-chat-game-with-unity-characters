'use client'

import AdminSidebar, { type AdminSidebarKey } from '@/components/shared/admin-sidebar'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type AdminPageShellProps = {
  activeKey: AdminSidebarKey
  children: ReactNode
  contentClassName?: string
}

const AdminPageShell = ({
  activeKey,
  children,
  contentClassName = 'min-w-0 p-4 pb-6 sm:p-6 lg:p-10'
}: AdminPageShellProps) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const activeLabel = useMemo(() => {
    const labelMap: Record<AdminSidebarKey, string> = {
      dashboard: 'Dashboard',
      activity: 'Activity',
      users: 'Users',
      'community-vrms': 'Community VRMs',
      'official-vrms': 'Official VRMs',
      'review-queue': 'Review Queue',
      'global-settings': 'Global Settings'
    }

    return labelMap[activeKey]
  }, [activeKey])

  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [activeKey])

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileSidebarOpen])

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#030303] px-2 pb-[env(safe-area-inset-bottom)] pt-28 sm:px-4 sm:pt-24 lg:px-6">
      <div className="mx-auto w-full min-w-0 max-w-[1540px]">
        <section className="relative overflow-hidden rounded-xl border border-white/10 bg-[#06080b] sm:rounded-[22px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(244,99,19,0.08),transparent_38%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px] opacity-[0.22]" />

          <div className="relative z-10 mt-5 flex items-center border-b border-white/10 bg-[#06080b]/95 px-4 py-3 backdrop-blur-md xl:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="inline-flex min-h-11 w-full max-w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 py-2.5 text-sm text-white transition hover:bg-white/5 sm:w-auto sm:justify-start"
              aria-label="Open admin navigation"
            >
              <span className="inline-flex size-4 items-center justify-center" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                </svg>
              </span>
              <span>{activeLabel}</span>
            </button>
          </div>

          <div
            className={`fixed inset-0 z-50 xl:hidden transition-opacity duration-300 ${
              isMobileSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            role="presentation"
            aria-hidden={!isMobileSidebarOpen}
          >
            <button
              type="button"
              className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
                isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close admin navigation"
            />
            <div
              className={`relative h-[100dvh] max-h-[100dvh] w-[min(86vw,320px)] overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-out ${
                isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              <AdminSidebar activeKey={activeKey} className="min-h-full border-r border-white/10 shadow-2xl shadow-black/70" />
            </div>
          </div>

          <div className="relative grid min-h-0 xl:grid-cols-[250px_1fr]">
            <AdminSidebar activeKey={activeKey} className="hidden min-h-0 xl:flex" />
            <div className={contentClassName}>{children}</div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default AdminPageShell
