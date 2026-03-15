'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import DashboardStatCard from '@/components/ui-elements/dashboard-stat-card'
import MyCharacterCard, { type CharacterModerationStatus, type MyCharacterCardRecord } from '@/components/ui-elements/my-character-card'
import SearchField from '@/components/ui-elements/search-field'
import SelectField from '@/components/ui-elements/select-field'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type CharacterStatusFilter = 'all' | CharacterModerationStatus
type CharacterSortOption = 'recent' | 'most-viewed' | 'most-hearted' | 'top-rated' | 'needs-action'

const statusFilterOptions: Array<{ value: CharacterStatusFilter; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Needs Changes' }
]

const sortOptions: Array<{ value: CharacterSortOption; label: string }> = [
  { value: 'recent', label: 'Recently Updated' },
  { value: 'most-viewed', label: 'Most Viewed' },
  { value: 'most-hearted', label: 'Most Hearted' },
  { value: 'top-rated', label: 'Top Rated' },
  { value: 'needs-action', label: 'Needs Action First' }
]

const initialCharacterRecords: MyCharacterCardRecord[] = [
  {
    id: 'my-character-1',
    slug: 'airi-akizuki',
    title: 'Airi Akizuki',
    summary: 'Main launch character with Patreon gated premium voice scenes and polished greeting dialogue.',
    moderationStatus: 'approved',
    visibility: 'public',
    nsfwLevel: 'mild',
    updatedAtLabel: '2h ago',
    views: 4210,
    hearts: 1893,
    rating: 4.8,
    pledgeAccess: 'patreon'
  },
  {
    id: 'my-character-2',
    slug: 'cafe-reina',
    title: 'Cafe Reina',
    summary: 'Casual chat-focused companion profile currently waiting in the moderation queue.',
    moderationStatus: 'pending',
    visibility: 'unlisted',
    nsfwLevel: 'none',
    updatedAtLabel: '5h ago',
    views: 922,
    hearts: 347,
    rating: 4.4,
    pledgeAccess: 'free'
  },
  {
    id: 'my-character-3',
    slug: 'luna-captain',
    title: 'Luna Captain',
    summary: 'Gameplay helper archetype still in draft while personality and scenario prompts are being refined.',
    moderationStatus: 'draft',
    visibility: 'private',
    nsfwLevel: 'none',
    updatedAtLabel: '1d ago',
    views: 112,
    hearts: 24,
    rating: 0,
    pledgeAccess: 'free'
  },
  {
    id: 'my-character-4',
    slug: 'ahri-night',
    title: 'Ahri Night',
    summary: 'Revision needed after moderation feedback about missing preview screenshots and unclear summary copy.',
    moderationStatus: 'rejected',
    visibility: 'private',
    nsfwLevel: 'mild',
    updatedAtLabel: '2d ago',
    views: 84,
    hearts: 12,
    rating: 0,
    pledgeAccess: 'patreon'
  }
]

const statusPriorityMap: Record<CharacterModerationStatus, number> = {
  rejected: 0,
  draft: 1,
  pending: 2,
  approved: 3
}

const YourCharactersPage = () => {
  const [characterRecords, setCharacterRecords] = useState<MyCharacterCardRecord[]>(initialCharacterRecords)
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<CharacterStatusFilter>('all')
  const [sortOption, setSortOption] = useState<CharacterSortOption>('recent')

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as CharacterStatusFilter)
  }

  const handleSortOptionChange = (value: string) => {
    setSortOption(value as CharacterSortOption)
  }

  const handleSubmitForReview = (characterId: string) => {
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
      if (sortOption === 'most-viewed') {
        return secondCharacter.views - firstCharacter.views
      }

      if (sortOption === 'most-hearted') {
        return secondCharacter.hearts - firstCharacter.hearts
      }

      if (sortOption === 'top-rated') {
        return secondCharacter.rating - firstCharacter.rating
      }

      if (sortOption === 'needs-action') {
        return statusPriorityMap[firstCharacter.moderationStatus] - statusPriorityMap[secondCharacter.moderationStatus]
      }

      const updatedFirstCharacterIsFresh = firstCharacter.updatedAtLabel === 'Just now'
      const updatedSecondCharacterIsFresh = secondCharacter.updatedAtLabel === 'Just now'

      if (updatedFirstCharacterIsFresh && !updatedSecondCharacterIsFresh) {
        return -1
      }

      if (!updatedFirstCharacterIsFresh && updatedSecondCharacterIsFresh) {
        return 1
      }

      return 0
    })
  }, [characterRecords, searchValue, sortOption, statusFilter])

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

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="your-characters" />

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
                    <SelectField
                      label="Sort"
                      value={sortOption}
                      options={sortOptions}
                      onChange={handleSortOptionChange}
                      ariaLabel="Sort your character list"
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

                <div className="mt-5 space-y-3">
                  {filteredAndSortedCharacters.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/20 bg-[#100f11] p-6 text-center">
                      <p className="text-sm text-white/75">No characters match your current filter settings.</p>
                    </div>
                  ) : (
                    filteredAndSortedCharacters.map((characterItem) => (
                      <MyCharacterCard key={characterItem.id} characterRecord={characterItem} onSubmitForReview={handleSubmitForReview} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default YourCharactersPage
