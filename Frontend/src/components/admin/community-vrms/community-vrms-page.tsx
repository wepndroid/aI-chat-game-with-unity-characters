'use client'
/* eslint-disable @next/next/no-img-element */

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminModalDialog from '@/components/ui-elements/admin-modal-dialog'
import { AdminVrmMetricHeartIcon, AdminVrmMetricViewsIcon } from '@/components/ui-elements/admin-vrm-metric-icons'
import { deleteCharacter, listCharacters, submitCharacterForReview, type CharacterListRecord } from '@/lib/character-api'
import { ADMIN_OVERVIEW_REFRESH_EVENT } from '@/lib/admin-overview-events'
import { apiPost } from '@/lib/api-client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type CommunityVrmFilterValue = 'all' | 'live' | 'draft' | 'removed'

const communityVrmFilterOptions: Array<{ value: CommunityVrmFilterValue; label: string }> = [
  { value: 'all', label: 'All status' },
  { value: 'live', label: 'Live' },
  { value: 'draft', label: 'Draft' },
  { value: 'removed', label: 'Removed' }
]

const isRemovedCharacter = (characterRecord: CharacterListRecord) =>
  characterRecord.status === 'REJECTED' || characterRecord.status === 'ARCHIVED'

type CommunityVrmRowStatus = 'live' | 'draft' | 'removed'

const getCommunityVrmRowStatus = (characterRecord: CharacterListRecord): CommunityVrmRowStatus => {
  if (isRemovedCharacter(characterRecord)) {
    return 'removed'
  }

  if (characterRecord.status === 'APPROVED') {
    return 'live'
  }

  return 'draft'
}

const communityVrmRowStatusClassName: Record<CommunityVrmRowStatus, string> = {
  live: 'border border-blue-500/55 bg-blue-950/55 text-blue-400',
  draft: 'border border-slate-600/65 bg-[#222831] text-[#b6c4d8]',
  removed: 'border border-red-500/55 bg-red-950/50 text-red-400'
}

const matchesCommunityVrmFilter = (characterRecord: CharacterListRecord, filter: CommunityVrmFilterValue) => {
  const removed = isRemovedCharacter(characterRecord)

  if (filter === 'all') {
    return true
  }

  if (removed) {
    return filter === 'removed'
  }

  if (filter === 'live') {
    return characterRecord.status === 'APPROVED'
  }

  if (filter === 'draft') {
    return characterRecord.status === 'DRAFT'
  }

  if (filter === 'removed') {
    return false
  }

  return true
}

const SearchIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  )
}

const communityVrmActionLinkClassName =
  'inline-flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-white/5 hover:text-[#d4d4d8]'

const communityVrmActionButtonClassName =
  'inline-flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-white/5 hover:text-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#9ca3af]'

const CommunityVrmEyeIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <path d="M2.7 12s3.5-6 9.3-6 9.3 6 9.3 6-3.5 6-9.3 6-9.3-6-9.3-6Z" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
)

const CommunityVrmReviewIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <path d="M12 3v18M3 12h18" strokeLinecap="round" />
  </svg>
)

const CommunityVrmTrashIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
    <path d="M4.8 6.8h14.4M9.3 6.8V5.4h5.4v1.4M8.4 9.3v8.4M12 9.3v8.4M15.6 9.3v8.4M6.8 6.8l.6 12a1.7 1.7 0 0 0 1.7 1.6h5.8a1.7 1.7 0 0 0 1.7-1.6l.6-12" />
  </svg>
)

type CommunityVrmRowActionsProps = {
  characterRecord: CharacterListRecord
  busyCharacterId: string | null
  onReview: (characterId: string) => void
  onMarkRemoved: (characterId: string, characterName: string) => void
}

const CommunityVrmRowActions = ({ characterRecord, busyCharacterId, onReview, onMarkRemoved }: CommunityVrmRowActionsProps) => {
  const rowBusy = busyCharacterId === characterRecord.id

  return (
    <div className="inline-flex items-center gap-2">
      <Link
        href={`/characters/${encodeURIComponent(characterRecord.slug)}`}
        className={communityVrmActionLinkClassName}
        aria-label={`View ${characterRecord.name} in gallery`}
      >
        <CommunityVrmEyeIcon />
      </Link>

      <button
        type="button"
        disabled={rowBusy}
        className={communityVrmActionButtonClassName}
        aria-label={`Send ${characterRecord.name} to review queue`}
        onClick={() => onReview(characterRecord.id)}
      >
        {rowBusy ? <span className="text-[10px] text-ember-300">…</span> : <CommunityVrmReviewIcon />}
      </button>

      <button
        type="button"
        className={communityVrmActionButtonClassName}
        aria-label={`Permanently delete ${characterRecord.name} and uploaded assets`}
        disabled={rowBusy}
        onClick={() => onMarkRemoved(characterRecord.id, characterRecord.name)}
      >
        <CommunityVrmTrashIcon />
      </button>
    </div>
  )
}

const CommunityVrmsPage = () => {
  const router = useRouter()
  const [communityFilter, setCommunityFilter] = useState<CommunityVrmFilterValue>('all')
  const [searchValue, setSearchValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [characterList, setCharacterList] = useState<CharacterListRecord[]>([])
  const [busyCharacterId, setBusyCharacterId] = useState<string | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; name: string } | null>(null)

  const loadCharacters = async (withSpinner = true) => {
    if (withSpinner) {
      setIsLoading(true)
    }
    setErrorMessage(null)

    try {
      const payload = await listCharacters({
        search: searchValue,
        galleryScope: 'community',
        adminCommunityAll: true,
        limit: 200
      })
      setCharacterList(payload.data)
    } catch (error) {
      setCharacterList([])
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load characters.')
    } finally {
      if (withSpinner) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await listCharacters({ galleryScope: 'community', adminCommunityAll: true, limit: 200 })
        if (!isCancelled) {
          setCharacterList(payload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setCharacterList([])
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load characters.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      try {
        await apiPost('/admin/me/community-vrms-seen', {})
        if (!isCancelled && typeof window !== 'undefined') {
          window.dispatchEvent(new Event(ADMIN_OVERVIEW_REFRESH_EVENT))
        }
      } catch {
        // Sidebar badge is best-effort if this fails.
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  const filteredCharacterList = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    return characterList.filter((characterRecord) => {
      if (characterRecord.status === 'PENDING' || characterRecord.status === 'REJECTED') {
        return false
      }

      if (!matchesCommunityVrmFilter(characterRecord, communityFilter)) {
        return false
      }

      if (normalizedSearchValue.length === 0) {
        return true
      }

      return (
        characterRecord.name.toLowerCase().includes(normalizedSearchValue) ||
        (characterRecord.tagline ?? '').toLowerCase().includes(normalizedSearchValue) ||
        characterRecord.owner.username.toLowerCase().includes(normalizedSearchValue) ||
        characterRecord.slug.toLowerCase().includes(normalizedSearchValue)
      )
    })
  }, [characterList, searchValue, communityFilter])

  const requestDeleteCharacter = (characterId: string, characterName: string) => {
    setDeleteConfirmTarget({ id: characterId, name: characterName })
  }

  const runConfirmedPermanentDelete = () => {
    const target = deleteConfirmTarget
    if (!target) {
      return
    }

    const characterId = target.id

    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await deleteCharacter(characterId)
        setCharacterList((previous) => previous.filter((characterRecord) => characterRecord.id !== characterId))
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to delete character.')
      } finally {
        await loadCharacters(false)
        setBusyCharacterId(null)
      }
    })
  }

  const handleReviewEnqueue = (characterId: string) => {
    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await submitCharacterForReview(characterId)
        await loadCharacters(false)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(ADMIN_OVERVIEW_REFRESH_EVENT))
        }
        router.push('/admin/review-queue')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to send character to review queue.')
      } finally {
        setBusyCharacterId(null)
      }
    })
  }

  return (
    <AdminPageShell activeKey="community-vrms">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            VRM Database
          </h1>
          <p className="mt-1 max-w-xl text-[13px] font-normal leading-snug text-[#8ea0bf] sm:text-[14px]">
            Submissions awaiting approval are managed on the{' '}
            <Link href="/admin/review-queue" className="text-ember-300 transition hover:text-ember-200">
              Review Queue
            </Link>{' '}
            page. After a decision, they appear in this list.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative inline-flex h-11 w-full items-center rounded-lg border border-ember-500/55 bg-[#12151b] px-3 sm:w-[180px]">
            <select
              value={communityFilter}
              onChange={(event) => setCommunityFilter(event.target.value as CommunityVrmFilterValue)}
              aria-label="Filter community VRMs"
              className="h-full w-full appearance-none truncate bg-transparent pr-8 text-base text-[#9cb0cc] outline-none"
            >
              {communityVrmFilterOptions.map((filterOption) => (
                <option key={filterOption.value} value={filterOption.value} className="bg-[#10151d] text-[#9cb0cb]">
                  {filterOption.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 inline-flex size-4 items-center justify-center text-[#9cb0cc]" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m5 7 5 6 5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </label>

          <label className="group inline-flex h-11 w-full max-w-[300px] items-center gap-2 rounded-lg border border-white/15 bg-[#0f1218]/95 px-3 text-[#6e809d] transition focus-within:border-ember-300 sm:w-[300px]">
            <span aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search VRMs..."
              aria-label="Search VRMs"
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
        title="Delete character permanently?"
        message={
          deleteConfirmTarget
            ? `Permanently delete "${deleteConfirmTarget.name}"? This removes the character record, gallery data, and locally hosted VRM and preview files. This cannot be undone.`
            : ''
        }
        onClose={() => setDeleteConfirmTarget(null)}
        onConfirm={runConfirmedPermanentDelete}
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        confirmVariant="danger"
      />

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="-mx-px overflow-x-auto sm:mx-0">
          <table className="min-w-[880px] w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Preview</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Name</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Uploader</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Metrics</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Status</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    Loading characters...
                  </td>
                </tr>
              ) : null}

              {!isLoading && filteredCharacterList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#7c8aa3]">
                    No VRMs match your filters.
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? filteredCharacterList.map((characterRecord) => {
                    const rowStatus = getCommunityVrmRowStatus(characterRecord)

                    return (
                      <tr key={characterRecord.id} className="border-t border-white/10">
                        <td className="px-4 py-4 align-middle">
                          {characterRecord.previewImageUrl ? (
                            <img
                              src={characterRecord.previewImageUrl}
                              alt=""
                              className="size-12 rounded-md border border-white/10 object-cover object-top"
                            />
                          ) : (
                            <div className="flex size-12 items-center justify-center rounded-md border border-white/10 bg-[#1a1f28] text-[10px] text-[#4a5a72]">
                              —
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-none text-white">{characterRecord.name}</p>
                          <p className="mt-1 text-sm text-[#6f809d]">{characterRecord.slug}</p>
                        </td>
                        <td className="px-4 py-4 align-middle text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ca9c2]">
                          {characterRecord.owner.username}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="inline-flex items-center gap-3 text-xs font-normal text-[#a8b6d0]">
                            <span className="inline-flex items-center gap-1 text-pink-400">
                              <AdminVrmMetricHeartIcon />
                              {characterRecord.heartsCount}
                            </span>
                            <span className="inline-flex items-center gap-1" title="Views">
                              <AdminVrmMetricViewsIcon />
                              {characterRecord.viewsCount}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-normal capitalize tracking-[0.06em] ${communityVrmRowStatusClassName[rowStatus]}`}
                          >
                            {rowStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <CommunityVrmRowActions
                            characterRecord={characterRecord}
                            busyCharacterId={busyCharacterId}
                            onReview={handleReviewEnqueue}
                            onMarkRemoved={requestDeleteCharacter}
                          />
                        </td>
                      </tr>
                    )
                  })
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default CommunityVrmsPage
