'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminModalDialog from '@/components/ui-elements/admin-modal-dialog'
import { AdminVrmMetricHeartIcon } from '@/components/ui-elements/admin-vrm-metric-icons'
import { deleteStory, listAdminStories, moderateStory, type StoryListRecord } from '@/lib/story-api'
import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const formatDate = (isoDate: string) => {
  return new Date(isoDate).toISOString().slice(0, 10)
}

const SearchIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  )
}

const StoryEyeIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <path d="M2.7 12s3.5-6 9.3-6 9.3 6 9.3 6-3.5 6-9.3 6-9.3-6-9.3-6Z" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
)

const StoryTrashIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <path d="M4.8 6.8h14.4M9.3 6.8V5.4h5.4v1.4M8.4 9.3v8.4M12 9.3v8.4M15.6 9.3v8.4M6.8 6.8l.6 12a1.7 1.7 0 0 0 1.7 1.6h5.8a1.7 1.7 0 0 0 1.7-1.6l.6-12" />
  </svg>
)

const storyActionLinkClassName =
  'inline-flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-white/5 hover:text-[#d4d4d8]'

const storyActionButtonClassName =
  'inline-flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-white/5 hover:text-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#9ca3af]'

const StorySettingsGearIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="size-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const STORY_SETTINGS_MENU_MIN_WIDTH_PX = 200

type AdminStoryRowActionsProps = {
  storyRow: StoryListRecord
  rowBusy: boolean
  onApprove: (storyId: string) => void
  onOpenReject: (row: StoryListRecord) => void
  onRequestDelete: (storyId: string, title: string) => void
}

const AdminStoryRowActions = ({
  storyRow,
  rowBusy,
  onApprove,
  onOpenReject,
  onRequestDelete
}: AdminStoryRowActionsProps) => {
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const menuAnchorRef = useRef<HTMLDivElement>(null)
  const menuPortalRef = useRef<HTMLDivElement>(null)

  const showModerationMenu = storyRow.moderationStatus === 'PENDING'

  useLayoutEffect(() => {
    if (!settingsMenuOpen) {
      setMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const anchor = menuAnchorRef.current
      if (!anchor) {
        return
      }

      const rect = anchor.getBoundingClientRect()
      const left = Math.min(
        Math.max(8, rect.right - STORY_SETTINGS_MENU_MIN_WIDTH_PX),
        window.innerWidth - STORY_SETTINGS_MENU_MIN_WIDTH_PX - 8
      )

      setMenuPosition({
        top: rect.bottom + 4,
        left
      })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [settingsMenuOpen])

  useEffect(() => {
    if (!settingsMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (menuAnchorRef.current?.contains(target)) {
        return
      }

      if (menuPortalRef.current?.contains(target)) {
        return
      }

      setSettingsMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [settingsMenuOpen])

  return (
    <div className="inline-flex items-center gap-0.5">
      <Link
        href={`/stories/${storyRow.id}`}
        target="_blank"
        rel="noreferrer"
        className={storyActionLinkClassName}
        aria-label={`Open story ${storyRow.title}`}
      >
        <StoryEyeIcon />
      </Link>

      {showModerationMenu ? (
        <div className="inline-flex" ref={menuAnchorRef}>
          <button
            type="button"
            onClick={() => setSettingsMenuOpen((open) => !open)}
            disabled={rowBusy}
            className={storyActionButtonClassName}
            aria-expanded={settingsMenuOpen}
            aria-haspopup="menu"
            aria-label={`Moderation options for ${storyRow.title}`}
          >
            {rowBusy ? <span className="text-[10px] text-ember-300">…</span> : <StorySettingsGearIcon />}
          </button>
        </div>
      ) : null}

      {settingsMenuOpen && menuPosition && showModerationMenu && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={menuPortalRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              zIndex: 100,
              minWidth: STORY_SETTINGS_MENU_MIN_WIDTH_PX
            }}
            className="rounded-lg border border-white/15 bg-[#12161c] py-1 shadow-lg shadow-black/40"
          >
            <button
              type="button"
              role="menuitem"
              disabled={rowBusy}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-emerald-200/95 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                setSettingsMenuOpen(false)
                onApprove(storyRow.id)
              }}
            >
              Approve
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={rowBusy}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-rose-200/95 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                setSettingsMenuOpen(false)
                onOpenReject(storyRow)
              }}
            >
              Reject
            </button>
          </div>,
          document.body
        )
        : null}

      <button
        type="button"
        className={storyActionButtonClassName}
        disabled={rowBusy}
        aria-label={`Delete story ${storyRow.title}`}
        onClick={() => onRequestDelete(storyRow.id, storyRow.title)}
      >
        <StoryTrashIcon />
      </button>
    </div>
  )
}

/** Aligned with `AdminUserStatusPill` palette (pending / active / banned). */
const moderationPillClassName: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
  PENDING: 'border-amber-500/35 bg-amber-500/15 text-amber-200',
  APPROVED: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  REJECTED: 'border-rose-500/35 bg-rose-500/15 text-rose-300'
}

const moderationLabel: Record<'PENDING' | 'APPROVED' | 'REJECTED', string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
}

type ModerationFilter = 'all' | 'pending' | 'approved' | 'rejected'

const AdminStoriesPage = () => {
  const [storyList, setStoryList] = useState<StoryListRecord[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageLimit] = useState(25)
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>('pending')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; title: string } | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null)
  const [rejectReasonInput, setRejectReasonInput] = useState('')

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 400)

    return () => window.clearTimeout(timerId)
  }, [searchInput])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, moderationFilter])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageLimit)), [total, pageLimit])

  const safePage = Math.min(Math.max(1, currentPage), totalPages)

  const loadStories = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const payload = await listAdminStories({
        page: safePage,
        limit: pageLimit,
        search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
        moderation: moderationFilter
      })

      setStoryList(payload.data)
      setTotal(payload.meta.total)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load stories.')
      setStoryList([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [safePage, pageLimit, debouncedSearch, moderationFilter])

  useEffect(() => {
    void loadStories()
  }, [loadStories])

  const requestDeleteStory = (storyId: string, title: string) => {
    setDeleteConfirmTarget({ id: storyId, title })
  }

  const runConfirmedDelete = () => {
    const target = deleteConfirmTarget
    if (!target) {
      return
    }

    const storyId = target.id

    Promise.resolve().then(async () => {
      setBusyStoryId(storyId)
      setErrorMessage(null)

      try {
        await deleteStory(storyId)
        await loadStories()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to delete story.')
      } finally {
        setBusyStoryId(null)
      }
    })
  }

  const handleApprove = (storyId: string) => {
    Promise.resolve().then(async () => {
      setBusyStoryId(storyId)
      setErrorMessage(null)
      try {
        await moderateStory(storyId, { decision: 'approve' })
        await loadStories()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to approve.')
      } finally {
        setBusyStoryId(null)
      }
    })
  }

  const openRejectModal = (row: StoryListRecord) => {
    setRejectReasonInput('')
    setRejectModal({ id: row.id, title: row.title })
  }

  const submitReject = () => {
    const target = rejectModal
    if (!target) {
      return
    }

    const reason = rejectReasonInput.trim()
    if (reason.length < 1) {
      setErrorMessage('A reject reason is required.')
      return
    }

    const storyId = target.id

    Promise.resolve().then(async () => {
      setBusyStoryId(storyId)
      setErrorMessage(null)

      try {
        await moderateStory(storyId, { decision: 'reject', rejectReason: reason })
        setRejectModal(null)
        await loadStories()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to reject.')
      } finally {
        setBusyStoryId(null)
      }
    })
  }

  return (
    <AdminPageShell activeKey="stories">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Stories
          </h1>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
          <label className="relative inline-flex h-11 min-w-[160px] items-center rounded-lg border border-ember-500/55 bg-[#12151b] px-3">
            <select
              value={moderationFilter}
              onChange={(event) => {
                setModerationFilter(event.target.value as ModerationFilter)
                setCurrentPage(1)
              }}
              aria-label="Filter by moderation"
              className="h-full w-full appearance-none truncate bg-transparent pr-8 text-base text-[#9cb0cc] outline-none"
            >
              <option value="pending" className="bg-[#10151d] text-[#9cb0cc]">
                Pending review
              </option>
              <option value="approved" className="bg-[#10151d] text-[#9cb0cc]">
                Approved
              </option>
              <option value="rejected" className="bg-[#10151d] text-[#9cb0cc]">
                Rejected
              </option>
              <option value="all" className="bg-[#10151d] text-[#9cb0cc]">
                All submitted
              </option>
            </select>
            <span className="pointer-events-none absolute right-3 inline-flex size-4 items-center justify-center text-[#9cb0cc]" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m5 7 5 6 5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </label>

          <label className="group inline-flex h-11 w-full min-w-[200px] max-w-[320px] items-center gap-2 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 text-[#6e809d] transition focus-within:border-ember-300 sm:flex-1 lg:max-w-[300px]">
            <span aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search title or body..."
              aria-label="Search stories"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#7585a1]"
            />
          </label>
        </div>
      </div>

      {errorMessage ? (
        <section className="mt-5 rounded-lg border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</section>
      ) : null}

      <AdminModalDialog
        open={deleteConfirmTarget !== null}
        title="Delete this story?"
        message={
          deleteConfirmTarget
            ? `Permanently delete "${deleteConfirmTarget.title}"? This cannot be undone.`
            : ''
        }
        onClose={() => setDeleteConfirmTarget(null)}
        onConfirm={runConfirmedDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
      />

      {rejectModal && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain p-4 py-8 sm:items-center sm:py-10"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setRejectModal(null)
              }
            }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
            <div
              className="relative z-10 w-full max-w-lg rounded-xl border border-white/15 bg-[#0f1218] p-5 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-story-title"
            >
              <h2 id="reject-story-title" className="text-lg font-normal text-white">
                Reject “{rejectModal.title}”
              </h2>
              <p className="mt-2 text-sm text-[#8ea0bf]">The author will see this message on the story page.</p>
              <textarea
                value={rejectReasonInput}
                onChange={(event) => setRejectReasonInput(event.target.value)}
                rows={5}
                placeholder="Reason for rejection..."
                className="mt-4 w-full resize-y rounded-lg border border-white/15 bg-[#0b0f14] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#5c6b82] focus:border-ember-400/50"
              />
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-[#c8d4e8] transition hover:bg-white/5"
                  onClick={() => setRejectModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyStoryId === rejectModal.id}
                  className="rounded-lg border border-rose-500/45 bg-rose-500/15 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                  onClick={() => submitReject()}
                >
                  {busyStoryId === rejectModal.id ? 'Rejecting...' : 'Reject story'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="-mx-px overflow-x-auto sm:mx-0">
          <table className="min-w-[980px] w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Story</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Author</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Moderation</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Likes</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Updated</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    Loading stories...
                  </td>
                </tr>
              ) : null}

              {!isLoading && storyList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    No stories match your filters.
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? storyList.map((row) => {
                  const rowBusy = busyStoryId === row.id
                  const ms = row.moderationStatus
                  const pillKey =
                    ms === 'PENDING' || ms === 'APPROVED' || ms === 'REJECTED' ? ms : 'APPROVED'

                  return (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="max-w-[min(380px,40vw)] px-4 py-4 align-top">
                        <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-snug text-white">{row.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm leading-snug text-[#6f809d]">{row.bodyPreview}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-middle text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ca9c2]">
                        {row.author.username}
                      </td>
                      <td className="max-w-[220px] px-4 py-4 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none ${moderationPillClassName[pillKey]}`}
                        >
                          {moderationLabel[pillKey]}
                        </span>
                        {row.moderationStatus === 'REJECTED' && row.moderationRejectReason ? (
                          <p className="mt-2 line-clamp-3 text-xs leading-snug text-[#9ca9c2]">{row.moderationRejectReason}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-middle">
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-pink-400">
                          <AdminVrmMetricHeartIcon />
                          {row.likesCount}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-[#a8b6d0]">{formatDate(row.updatedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-4 align-middle">
                        <AdminStoryRowActions
                          storyRow={row}
                          rowBusy={rowBusy}
                          onApprove={handleApprove}
                          onOpenReject={openRejectModal}
                          onRequestDelete={requestDeleteStory}
                        />
                      </td>
                    </tr>
                  )
                })
                : null}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#7c8aa3]">
              Page {safePage} of {totalPages} · {total} stor{total === 1 ? 'y' : 'ies'}
            </p>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[#c8d4e8] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[#c8d4e8] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </AdminPageShell>
  )
}

export default AdminStoriesPage
