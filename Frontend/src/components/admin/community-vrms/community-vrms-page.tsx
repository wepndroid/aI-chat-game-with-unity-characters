'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { listCharacters, updateCharacterStatus, updateCharacterVisibility, type CharacterListRecord } from '@/lib/character-api'
import { useEffect, useMemo, useState } from 'react'

type StatusFilterValue = 'all' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'

const statusFilterOptions: Array<{ value: StatusFilterValue; label: string }> = [
  { value: 'all', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' }
]

const SearchIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  )
}

const CommunityVrmsPage = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [searchValue, setSearchValue] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [characterList, setCharacterList] = useState<CharacterListRecord[]>([])
  const [busyCharacterId, setBusyCharacterId] = useState<string | null>(null)

  const loadCharacters = async (withSpinner = true) => {
    if (withSpinner) {
      setIsLoading(true)
    }
    setErrorMessage(null)

    try {
      const payload = await listCharacters({ search: searchValue, limit: 200 })
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
        const payload = await listCharacters({ limit: 200 })
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

  const filteredCharacterList = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    return characterList.filter((characterRecord) => {
      if (statusFilter !== 'all' && characterRecord.status !== statusFilter) {
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
  }, [characterList, searchValue, statusFilter])

  const handleApprove = (characterId: string) => {
    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await updateCharacterStatus(characterId, 'APPROVED')
        await updateCharacterVisibility(characterId, 'PUBLIC')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to approve character.')
      } finally {
        await loadCharacters(false)
        setBusyCharacterId(null)
      }
    })
  }

  const handleReject = (characterId: string) => {
    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await updateCharacterStatus(characterId, 'REJECTED')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to reject character.')
      } finally {
        await loadCharacters(false)
        setBusyCharacterId(null)
      }
    })
  }

  const handlePublish = (characterId: string) => {
    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await updateCharacterVisibility(characterId, 'PUBLIC')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to publish character.')
      } finally {
        await loadCharacters(false)
        setBusyCharacterId(null)
      }
    })
  }

  const handleUnpublish = (characterId: string) => {
    Promise.resolve().then(async () => {
      setBusyCharacterId(characterId)
      setErrorMessage(null)

      try {
        await updateCharacterVisibility(characterId, 'PRIVATE')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to unpublish character.')
      } finally {
        await loadCharacters(false)
        setBusyCharacterId(null)
      }
    })
  }

  return (
    <AdminPageShell activeKey="community-vrms">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">VRM Database</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="inline-flex h-11 items-center rounded-lg border border-ember-500/55 bg-[#12151b] px-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
              aria-label="Filter VRMs by status"
              className="h-full bg-transparent text-base text-[#9cb0cc] outline-none"
            >
              {statusFilterOptions.map((statusOption) => (
                <option key={statusOption.value} value={statusOption.value} className="bg-[#10151d] text-[#9cb0cc]">
                  {statusOption.label}
                </option>
              ))}
            </select>
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

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14]/95">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b21]/85">
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Name</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Uploader</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Metrics</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Status</th>
                <th className="px-4 py-4 text-left text-[14px] font-normal text-[#8ea0bf]">Visibility</th>
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
                ? filteredCharacterList.map((characterRecord) => (
                    <tr key={characterRecord.id} className="border-t border-white/10">
                      <td className="px-4 py-4 align-middle">
                        <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-none text-white">{characterRecord.name}</p>
                        <p className="mt-1 text-sm text-[#6f809d]">{characterRecord.slug}</p>
                      </td>
                      <td className="px-4 py-4 align-middle text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ca9c2]">
                        {characterRecord.owner.username}
                      </td>
                      <td className="px-4 py-4 align-middle text-xs text-[#a8b6d0]">
                        <p>Hearts: {characterRecord.heartsCount}</p>
                        <p>Views: {characterRecord.viewsCount}</p>
                      </td>
                      <td className="px-4 py-4 align-middle text-xs uppercase tracking-[0.08em] text-white/80">{characterRecord.status}</td>
                      <td className="px-4 py-4 align-middle text-xs uppercase tracking-[0.08em] text-white/80">{characterRecord.visibility}</td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] uppercase text-emerald-200 disabled:opacity-60"
                            aria-label={`Approve ${characterRecord.name}`}
                            onClick={() => handleApprove(characterRecord.id)}
                            disabled={busyCharacterId === characterRecord.id}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[10px] uppercase text-rose-200 disabled:opacity-60"
                            aria-label={`Reject ${characterRecord.name}`}
                            onClick={() => handleReject(characterRecord.id)}
                            disabled={busyCharacterId === characterRecord.id}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[10px] uppercase text-amber-200 disabled:opacity-60"
                            aria-label={`Publish ${characterRecord.name}`}
                            onClick={() => handlePublish(characterRecord.id)}
                            disabled={busyCharacterId === characterRecord.id || characterRecord.status !== 'APPROVED'}
                          >
                            Publish
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-[10px] uppercase text-white/80 disabled:opacity-60"
                            aria-label={`Unpublish ${characterRecord.name}`}
                            onClick={() => handleUnpublish(characterRecord.id)}
                            disabled={busyCharacterId === characterRecord.id}
                          >
                            Unpublish
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  )
}

export default CommunityVrmsPage
