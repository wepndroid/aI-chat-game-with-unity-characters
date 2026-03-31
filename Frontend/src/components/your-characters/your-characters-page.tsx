'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import MaintenanceWorkspaceGate from '@/components/shared/maintenance-workspace-gate'
import { useAuth } from '@/components/providers/auth-provider'
import DashboardStatCard from '@/components/ui-elements/dashboard-stat-card'
import MyCharacterCard, { type CharacterModerationStatus, type MyCharacterCardRecord } from '@/components/ui-elements/my-character-card'
import SearchField from '@/components/ui-elements/search-field'
import SelectField from '@/components/ui-elements/select-field'
import { listMyCharacters, submitCharacterForReview, type CharacterMineRecord } from '@/lib/character-api'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type CharacterStatusFilter = 'all' | CharacterModerationStatus

const statusFilterOptions: Array<{ value: CharacterStatusFilter; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' }
]

const statusPriorityMap: Record<CharacterModerationStatus, number> = {
  rejected: 0,
  draft: 1,
  pending: 2,
  approved: 3
}

const formatRelativeTimeLabel = (isoValue: string) => {
  const targetMs = Date.parse(isoValue)

  if (Number.isNaN(targetMs)) {
    return 'unknown'
  }

  const diffMs = Date.now() - targetMs
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

const toCardRecord = (characterRecord: CharacterMineRecord): MyCharacterCardRecord => {
  const normalizedStatus = characterRecord.status.toLowerCase()
  const mappedStatus: CharacterModerationStatus =
    normalizedStatus === 'approved' || normalizedStatus === 'pending' || normalizedStatus === 'rejected'
      ? (normalizedStatus as CharacterModerationStatus)
      : 'draft'

  const normalizedVisibility = characterRecord.visibility.toLowerCase()
  const mappedVisibility = normalizedVisibility === 'public' || normalizedVisibility === 'unlisted' ? normalizedVisibility : 'private'

  return {
    id: characterRecord.id,
    slug: characterRecord.slug,
    title: characterRecord.name,
    summary: characterRecord.tagline?.trim() || 'No tagline yet. Update this character to improve discoverability.',
    moderationStatus: mappedStatus,
    moderationRejectReason: characterRecord.moderationRejectReason,
    visibility: mappedVisibility,
    nsfwLevel: 'none',
    updatedAtLabel: formatRelativeTimeLabel(characterRecord.updatedAt),
    views: characterRecord.viewsCount,
    hearts: characterRecord.heartsCount,
    pledgeAccess: characterRecord.isPatreonGated ? 'patreon' : 'free'
  }
}

const YourCharactersPage = () => {
  const { sessionUser } = useAuth()
  const isAdmin = sessionUser?.role === 'ADMIN'
  const [characterRecords, setCharacterRecords] = useState<MyCharacterCardRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<CharacterStatusFilter>('all')

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await listMyCharacters()

        if (isCancelled) {
          return
        }

        setCharacterRecords(payload.data.map(toCardRecord))
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load your characters.')
          setCharacterRecords([])
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

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as CharacterStatusFilter)
  }

  const handleSubmitForReview = (characterId: string) => {
    Promise.resolve().then(async () => {
      try {
        await submitCharacterForReview(characterId)
        setCharacterRecords((previousRecords) =>
          previousRecords.map((characterItem) => {
            if (characterItem.id !== characterId) {
              return characterItem
            }

            return {
              ...characterItem,
              moderationStatus: 'pending',
              updatedAtLabel: 'Just now'
            }
          })
        )
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to submit character for review.')
      }
    })
  }

  const filteredAndSortedCharacters = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()

    const filteredCharacters = characterRecords.filter((characterItem) => {
      if (statusFilter !== 'all' && characterItem.moderationStatus !== statusFilter) {
        return false
      }

      if (normalizedSearch.length === 0) {
        return true
      }

      return characterItem.title.toLowerCase().includes(normalizedSearch) || characterItem.summary.toLowerCase().includes(normalizedSearch)
    })

    return [...filteredCharacters].sort((firstCharacter, secondCharacter) => {
      // Default: needs-action first, then stable order (already server-sorted by updatedAt).
      return statusPriorityMap[firstCharacter.moderationStatus] - statusPriorityMap[secondCharacter.moderationStatus]
    })
  }, [characterRecords, searchValue, statusFilter])

  const dashboardStats = useMemo(() => {
    const totalCount = characterRecords.length
    const approvedCount = characterRecords.filter((characterItem) => characterItem.moderationStatus === 'approved').length
    const pendingCount = characterRecords.filter((characterItem) => characterItem.moderationStatus === 'pending').length
    const requiresActionCount = characterRecords.filter((characterItem) => characterItem.moderationStatus === 'draft' || characterItem.moderationStatus === 'rejected').length

    return {
      totalCount,
      approvedCount,
      pendingCount,
      requiresActionCount
    }
  }, [characterRecords])

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            Your Characters
          </h1>
          <p className="mx-auto mt-3 max-w-[780px] text-center text-sm leading-7 text-white/70">
            Manage drafts, submit updates for approval, and track your live character performance with moderation-aware statuses.
          </p>

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
            <AccountSideMenu activeKey="your-characters" />

            <MaintenanceWorkspaceGate>
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardStatCard value={dashboardStats.totalCount.toString()} label="Total Characters" helperText="All drafts and published entries" />
                <DashboardStatCard value={dashboardStats.approvedCount.toString()} label="Approved" helperText="Visible in public gallery" />
                <DashboardStatCard value={dashboardStats.pendingCount.toString()} label="Pending Review" helperText="Waiting for admin/moderator decision" isEmphasized />
                <DashboardStatCard value={dashboardStats.requiresActionCount.toString()} label="Needs Action" helperText="Draft or rejected items to update" />
              </div>

              <div className="rounded-xl border border-white/10 bg-[#161213]/95 p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-[520px]">
                    <SelectField
                      label="Status"
                      value={statusFilter}
                      options={statusFilterOptions}
                      onChange={handleStatusFilterChange}
                      ariaLabel="Filter your characters by moderation status"
                    />
                  </div>

                  <div className="flex w-full flex-col gap-3 sm:flex-row xl:max-w-[520px]">
                    <SearchField
                      value={searchValue}
                      onChange={handleSearchChange}
                      placeholder="Search your characters..."
                      ariaLabel="Search your character records"
                    />
                    <Link
                      href="/upload-vrm"
                      className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
                      aria-label="Upload new VRM character"
                    >
                      Upload New VRM
                    </Link>
                  </div>
                </div>

                {errorMessage ? (
                  <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{errorMessage}</p>
                ) : null}

                <div className="mt-5 space-y-3">
                  {isLoading ? (
                    <div className="rounded-lg border border-dashed border-white/20 bg-[#100f11] p-6 text-center">
                      <p className="text-sm text-white/75">Loading your characters...</p>
                    </div>
                  ) : null}

                  {!isLoading && filteredAndSortedCharacters.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/20 bg-[#100f11] p-6 text-center">
                      <p className="text-sm text-white/75">No characters match your current filter settings.</p>
                    </div>
                  ) : !isLoading ? (
                    filteredAndSortedCharacters.map((characterItem) => (
                      <MyCharacterCard
                        key={characterItem.id}
                        characterRecord={characterItem}
                        onSubmitForReview={isAdmin ? undefined : handleSubmitForReview}
                        adminMode={Boolean(isAdmin)}
                      />
                    ))
                  ) : null}
                </div>
              </div>
            </div>
            </MaintenanceWorkspaceGate>
          </div>
        </div>
      </section>
    </main>
  )
}

export default YourCharactersPage
