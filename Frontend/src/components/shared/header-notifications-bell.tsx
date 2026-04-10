'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { getMyNotifications, markNotificationRead, type NotificationFeedItem } from '@/lib/notifications-api'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const formatNotificationTime = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

const HeaderNotificationsBell = () => {
  const { sessionUser, refreshSessionUser } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationFeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const unreadCount = sessionUser?.unreadNotificationCount ?? 0

  const loadFeed = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    void getMyNotifications()
      .then((payload) => {
        setItems(payload.data.items)
      })
      .catch(() => {
        setLoadError('Could not load notifications.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const onDocPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', onDocPointerDown)
    }
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [open])

  const handleToggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    loadFeed()
  }

  const handleItemActivate = async (item: NotificationFeedItem) => {
    try {
      if (!item.read) {
        await markNotificationRead(item.id)
        await refreshSessionUser()
      }
    } catch {
      // Still navigate even if mark-read fails.
    }
    setOpen(false)
    router.push(item.href)
  }

  if (!sessionUser) {
    return null
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        className={`relative flex size-9 shrink-0 items-center justify-center rounded-full border transition ${
          unreadCount > 0
            ? 'border-red-500/55 bg-red-950/35 text-red-100 hover:border-red-400/70 hover:bg-red-950/50'
            : 'border-white/20 bg-black/30 text-white/60 hover:border-white/35 hover:bg-black/45 hover:text-white/90'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        title="Notifications"
        onClick={handleToggle}
      >
        <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.009A6 6 0 006 9.75v.75a8.967 8.967 0 01-2.312 6.022c1.733.641 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-6 0"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold tabular-nums leading-none text-white ring-2 ring-[#0b0b0b]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-[60] mt-2 w-[min(calc(100vw-2rem),20rem)] rounded-lg border border-ember-500/45 bg-[#0a0a0a] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.65),0_0_0_1px_rgba(244,99,19,0.12)_inset] backdrop-blur-md"
          role="menu"
        >
          <p className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
            Notifications
          </p>
          <div className="max-h-[min(60vh,320px)] overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-center text-xs text-white/45">Loading…</p>
            ) : loadError ? (
              <p className="px-3 py-4 text-center text-xs text-rose-300">{loadError}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-white/45">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`flex w-full flex-col gap-0.5 border-b border-white/[0.06] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-white/[0.06] ${
                    item.read ? 'opacity-75' : ''
                  }`}
                  onClick={() => void handleItemActivate(item)}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={`text-[13px] font-semibold leading-snug ${item.read ? 'text-white/75' : 'text-white'}`}>
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-white/35">{formatNotificationTime(item.createdAt)}</span>
                  </span>
                  {item.body ? (
                    <span className="line-clamp-2 text-[11px] leading-relaxed text-white/55">{item.body}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { HeaderNotificationsBell }
