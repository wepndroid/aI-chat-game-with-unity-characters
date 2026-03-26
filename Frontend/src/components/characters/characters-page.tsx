'use client'

import { useAuth } from '@/components/providers/auth-provider'
import CharacterGalleryCard from '@/components/ui-elements/character-gallery-card'
import FilterTab from '@/components/ui-elements/filter-tab'
import PaginationControls from '@/components/ui-elements/pagination-controls'
import SearchField from '@/components/ui-elements/search-field'
import { listCharacters, type CharacterListRecord, type GallerySort } from '@/lib/character-api'
import { apiGet } from '@/lib/api-client'
import { resolveAvailableTierCents, type PatreonStatusSnapshot } from '@/lib/patreon-access'
import { useEffect, useMemo, useState } from 'react'

type CharacterCategory = 'curated' | 'community' | 'your-characters'

const categoryTabs: Array<{ key: CharacterCategory; label: string }> = [
  { key: 'curated', label: 'Curated' },
  { key: 'community', label: 'Community' },
  { key: 'your-characters', label: 'Your Characters' }
]

type CharacterSortOption = 'newest' | 'most-hearted' | 'most-viewed' | 'name-az'

const sortOptions: Array<{ value: CharacterSortOption; label: string; apiSort: GallerySort }> = [
  { value: 'newest', label: 'Newest', apiSort: 'newest' },
  { value: 'most-hearted', label: 'Most Hearted', apiSort: 'hearts' },
  { value: 'most-viewed', label: 'Most Viewed', apiSort: 'views' },
  { value: 'name-az', label: 'Name A-Z', apiSort: 'name' }
]

const defaultGradientVariants = [
  'from-[#322a39] via-[#19263a] to-[#0b1018]',
  'from-[#3f343a] via-[#2a2e37] to-[#121722]',
  'from-[#29252f] via-[#1d1e2f] to-[#11111b]',
  'from-[#332936] via-[#2a2030] to-[#150f18]'
]

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

const resolveCharacterGatedAccess = (
  characterRecord: CharacterListRecord,
  sessionUser: { id: string; role: 'USER' | 'CREATOR' | 'ADMIN' } | null,
  availableTierCents: number
) => {
  if (!characterRecord.isPatreonGated) {
    return true
  }

  if (!sessionUser) {
    return false
  }

  if (sessionUser.role === 'ADMIN' || sessionUser.id === characterRecord.owner.id) {
    return true
  }

  const requiredTierCents = characterRecord.minimumTierCents ?? 1
  return availableTierCents >= requiredTierCents
}

const CharactersPage = () => {
  const { sessionUser, isAuthLoading } = useAuth()
  const sessionUserId = sessionUser?.id ?? null
  const [activeCategory, setActiveCategory] = useState<CharacterCategory>('curated')
  const [activeSortOption, setActiveSortOption] = useState<CharacterSortOption>('newest')
  const [searchValue, setSearchValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isCharactersLoading, setIsCharactersLoading] = useState(true)
  const [isPatreonLoading, setIsPatreonLoading] = useState(false)
  const [charactersErrorMessage, setCharactersErrorMessage] = useState<string | null>(null)
  const [characterList, setCharacterList] = useState<CharacterListRecord[]>([])
  const [patreonStatusSnapshot, setPatreonStatusSnapshot] = useState<PatreonStatusSnapshot | null>(null)

  const resolvedApiSort = useMemo(() => {
    return sortOptions.find((option) => option.value === activeSortOption)?.apiSort ?? 'newest'
  }, [activeSortOption])

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (activeCategory === 'your-characters' && !sessionUserId) {
      setCharacterList([])
      setCharactersErrorMessage('Sign in to view your characters.')
      setIsCharactersLoading(false)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      if (isCancelled) {
        return
      }

      setIsCharactersLoading(true)
      setCharactersErrorMessage(null)

      try {
        const galleryScope = activeCategory === 'curated' ? 'curated' : activeCategory === 'community' ? 'community' : 'mine'

        const payload = await listCharacters({
          search: searchValue,
          galleryScope,
          sort: resolvedApiSort
        })

        if (isCancelled) {
          return
        }

        setCharacterList(payload.data)
      } catch (error) {
        if (isCancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Failed to load characters.'
        setCharactersErrorMessage(message)
        setCharacterList([])
      } finally {
        if (!isCancelled) {
          setIsCharactersLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [isAuthLoading, sessionUserId, activeCategory, resolvedApiSort, searchValue])

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (!sessionUserId) {
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      if (isCancelled) {
        return
      }

      setIsPatreonLoading(true)

      try {
        const payload = await apiGet<{ data: PatreonStatusSnapshot }>('/patreon/status')

        if (isCancelled) {
          return
        }

        setPatreonStatusSnapshot(payload.data)
      } catch {
        if (!isCancelled) {
          setPatreonStatusSnapshot(null)
        }
      } finally {
        if (!isCancelled) {
          setIsPatreonLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [isAuthLoading, sessionUserId])

  const availableTierCents = useMemo(() => {
    if (!sessionUser || !patreonStatusSnapshot) {
      return 0
    }

    return resolveAvailableTierCents(patreonStatusSnapshot)
  }, [patreonStatusSnapshot, sessionUser])

  useEffect(() => {
    if (sessionUserId) {
      return
    }

    Promise.resolve().then(() => {
      setPatreonStatusSnapshot(null)
      setIsPatreonLoading(false)
    })
  }, [sessionUserId])

  const handleCategoryChange = (nextCategory: CharacterCategory) => {
    setActiveCategory(nextCategory)
    setCurrentPage(1)
  }

  const handleSearchChange = (nextSearchValue: string) => {
    setSearchValue(nextSearchValue)
    setCurrentPage(1)
  }

  const filteredAndSortedCharacters = characterList

  const itemsPerPage = 12
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedCharacters.length / itemsPerPage))
  const visiblePage = Math.min(currentPage, totalPages)

  const paginatedCharacters = useMemo(() => {
    const offset = (visiblePage - 1) * itemsPerPage
    return filteredAndSortedCharacters.slice(offset, offset + itemsPerPage)
  }, [filteredAndSortedCharacters, visiblePage])

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_0%,rgba(244,99,19,0.15),transparent_32%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic text-white md:text-6xl">
            AI Anime Girlfriend
          </h1>

          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-4 border-b border-white/15 pb-2">
                {categoryTabs.map((tabItem) => (
                  <FilterTab
                    key={tabItem.key}
                    label={tabItem.label}
                    isActive={activeCategory === tabItem.key}
                    onClick={() => handleCategoryChange(tabItem.key)}
                    ariaLabel={`Filter by ${tabItem.label}`}
                  />
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Sort
                <select
                  value={activeSortOption}
                  onChange={(event) => {
                    setActiveSortOption(event.target.value as CharacterSortOption)
                    setCurrentPage(1)
                  }}
                  className="h-9 min-w-[160px] rounded-md border border-white/20 bg-black/35 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white outline-none transition focus:border-ember-300"
                  aria-label="Sort characters"
                >
                  {sortOptions.map((sortOption) => (
                    <option key={sortOption.value} value={sortOption.value} className="bg-[#101014]">
                      {sortOption.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="w-full md:max-w-[430px]">
              <SearchField
                value={searchValue}
                onChange={handleSearchChange}
                placeholder="Search..."
                ariaLabel="Search characters"
              />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isCharactersLoading ? (
              <p className="col-span-full text-sm text-white/70">Loading characters...</p>
            ) : null}
            {!isCharactersLoading && charactersErrorMessage ? (
              <p className="col-span-full rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                {charactersErrorMessage}
              </p>
            ) : null}
            {!isCharactersLoading && !charactersErrorMessage && paginatedCharacters.length === 0 ? (
              <p className="col-span-full text-sm text-white/70">No characters match this filter.</p>
            ) : null}
            {!isCharactersLoading && !charactersErrorMessage
              ? paginatedCharacters.map((characterItem, index) => {
                  const hasGatedAccess = resolveCharacterGatedAccess(characterItem, sessionUser, availableTierCents)

                  return (
                    <CharacterGalleryCard
                      key={characterItem.id}
                      routeId={characterItem.slug}
                      name={characterItem.name}
                      likes={formatCompactNumber(characterItem.heartsCount)}
                      chats={formatCompactNumber(characterItem.viewsCount)}
                      gradientClassName={defaultGradientVariants[index % defaultGradientVariants.length]}
                      description={characterItem.tagline ?? undefined}
                      previewImageUrl={characterItem.previewImageUrl}
                      isPatreonGated={characterItem.isPatreonGated}
                      hasGatedAccess={hasGatedAccess}
                      requiredTierCents={characterItem.minimumTierCents}
                    />
                  )
                })
              : null}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 text-center md:flex-row md:gap-6">
            <p className="text-xs text-white/75">
              {filteredAndSortedCharacters.length} VRM characters
              {isPatreonLoading ? ' | Syncing membership...' : ''}
            </p>
            <PaginationControls currentPage={visiblePage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>
      </section>
    </main>
  )
}

export default CharactersPage
