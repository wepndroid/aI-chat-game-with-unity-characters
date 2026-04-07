'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminModalDialog from '@/components/ui-elements/admin-modal-dialog'
import { AdminVrmMetricHeartIcon } from '@/components/ui-elements/admin-vrm-metric-icons'
import { deleteStory, listAdminStories, type StoryListRecord } from '@/lib/story-api'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

/** Admin list is published-only; compact pill for the column. */
const publishedBadgeClassName =
  'inline-flex max-h-[14px] items-center rounded border border-emerald-500/35 bg-emerald-950/30 px-[5px] py-0 text-[8px] font-medium leading-none uppercase tracking-[0.04em] text-emerald-300/95'

const AdminStoriesPage = () => {
  const [storyList, setStoryList] = useState<StoryListRecord[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageLimit] = useState(25)
  const [sortValue, setSortValue] = useState<'newest' | 'oldest' | 'likes'>('newest')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyStoryId, setBusyStoryId] = useState<string | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, 400)

    return () => window.clearTimeout(timerId)
  }, [searchInput])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

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
        sort: sortValue
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
  }, [safePage, pageLimit, debouncedSearch, sortValue])

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

  return (
    <AdminPageShell activeKey="stories">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Stories
          </h1>
          <p className="mt-1 max-w-xl text-[13px] font-normal leading-snug text-[#8ea0bf] sm:text-[14px]">
            Published stories only — drafts stay on the author&apos;s account. Deleting a story cannot be undone.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
          <label className="relative inline-flex h-11 min-w-[140px] items-center rounded-lg border border-ember-500/55 bg-[#12151b] px-3">
            <select
              value={sortValue}
              onChange={(event) => {
                setSortValue(event.target.value as typeof sortValue)
                setCurrentPage(1)
              }}
              aria-label="Sort stories"
              className="h-full w-full appearance-none truncate bg-transparent pr-8 text-base text-[#9cb0cc] outline-none"
            >
              <option value="newest" className="bg-[#10151d] text-[#9cb0cc]">
                Newest
              </option>
              <option value="oldest" className="bg-[#10151d] text-[#9cb0cc]">
                Oldest
              </option>
              <option value="likes" className="bg-[#10151d] text-[#9cb0cc]">
                Most liked
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

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="-mx-px overflow-x-auto sm:mx-0">
          <table className="min-w-[920px] w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Story</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Author</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Publication</th>
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

                    return (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="max-w-[min(420px,45vw)] px-4 py-4 align-top">
                          <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-snug text-white">{row.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-snug text-[#6f809d]">{row.bodyPreview}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ca9c2]">
                          {row.author.username}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <span className={publishedBadgeClassName}>Published</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle">
                          <span className="inline-flex items-center gap-1 text-xs font-normal text-pink-400">
                            <AdminVrmMetricHeartIcon />
                            {row.likesCount}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-[#a8b6d0]">{formatDate(row.updatedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-middle">
                          <div className="inline-flex items-center gap-0.5">
                            <Link
                              href={`/stories/${row.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className={storyActionLinkClassName}
                              aria-label={`Open story ${row.title}`}
                            >
                              <StoryEyeIcon />
                            </Link>
                            <button
                              type="button"
                              className={storyActionButtonClassName}
                              disabled={rowBusy}
                              aria-label={`Delete story ${row.title}`}
                              onClick={() => requestDeleteStory(row.id, row.title)}
                            >
                              <StoryTrashIcon />
                            </button>
                          </div>
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
