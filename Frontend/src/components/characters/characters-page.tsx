'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useMaintenance } from '@/components/providers/maintenance-provider'
import CharacterGalleryCard from '@/components/ui-elements/character-gallery-card'
import FilterTab from '@/components/ui-elements/filter-tab'
import PaginationControls from '@/components/ui-elements/pagination-controls'
import SearchField from '@/components/ui-elements/search-field'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { formatCompactCount } from '@/lib/format-compact-count'
import { useEffect, useMemo, useRef, useState } from 'react'

type CharacterCategory = 'all' | 'curated' | 'community' | 'your-characters'

type CharactersPageProps = {
  initialCharacterList?: CharacterListRecord[]
}

const categoryTabs: Array<{ key: CharacterCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'curated', label: 'Official' },
  { key: 'community', label: 'Community' },
  { key: 'your-characters', label: 'Your AI Girlfriends' }
]

const defaultGradientVariants = [
  'from-[#322a39] via-[#19263a] to-[#0b1018]',
  'from-[#3f343a] via-[#2a2e37] to-[#121722]',
  'from-[#29252f] via-[#1d1e2f] to-[#11111b]',
  'from-[#332936] via-[#2a2030] to-[#150f18]'
]

const isMaintenanceApiError = (error: unknown) => {
  const text = error instanceof Error ? error.message : ''
  const lower = text.toLowerCase()
  return lower.includes('maintenance') || text.includes('MAINTENANCE_MODE')
}

/** Returns null when the failure is server maintenance — the global header banner is enough. */
const toUserFriendlyCharactersError = (error: unknown, hasSearchQuery: boolean): string | null => {
  if (isMaintenanceApiError(error)) {
    return null
  }

  const rawMessage = error instanceof Error ? error.message.toLowerCase() : ''
  const looksLikeNetworkIssue =
    rawMessage.includes('failed to fetch') ||
    rawMessage.includes('network') ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('econn') ||
    rawMessage.includes('503') ||
    rawMessage.includes('500')

  if (hasSearchQuery) {
    return looksLikeNetworkIssue
      ? 'Search is temporarily unavailable. Please check your connection and try again.'
      : 'We could not complete your search right now. Please try again.'
  }

  return looksLikeNetworkIssue
    ? 'AI girlfriends are temporarily unavailable. Please check your connection and refresh the page.'
    : 'We could not load AI girlfriends right now. Please refresh and try again.'
}

const CharactersPage = ({ initialCharacterList = [] }: CharactersPageProps) => {
  const { sessionUser, isAuthLoading } = useAuth()
  const { isMaintenanceActive } = useMaintenance()
  const sessionUserId = sessionUser?.id ?? null
  const initialCharacterListRef = useRef(initialCharacterList)
  const didSkipInitialFetchRef = useRef(initialCharacterList.length > 0)
  const [activeCategory, setActiveCategory] = useState<CharacterCategory>('all')
  const [searchValue, setSearchValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isCharactersLoading, setIsCharactersLoading] = useState(initialCharacterList.length === 0)
  const [charactersErrorMessage, setCharactersErrorMessage] = useState<string | null>(null)
  const [characterList, setCharacterList] = useState<CharacterListRecord[]>(initialCharacterList)
  const [actionAlertMessage, setActionAlertMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (didSkipInitialFetchRef.current && activeCategory === 'all' && searchValue.trim().length === 0) {
      didSkipInitialFetchRef.current = false
      setCharacterList(initialCharacterListRef.current)
      setCharactersErrorMessage(null)
      setIsCharactersLoading(false)
      return
    }

    if (activeCategory === 'your-characters' && !sessionUserId) {
      setCharacterList([])
      setCharactersErrorMessage('Sign in to view your AI girlfriends.')
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
        const galleryScope =
          activeCategory === 'all'
            ? 'all'
            : activeCategory === 'curated'
              ? 'curated'
              : activeCategory === 'community'
                ? 'community'
                : 'mine'

        const payload = await listCharacters({
          search: searchValue,
          galleryScope,
          sort: 'newest'
        })

        if (isCancelled) {
          return
        }

        setCharacterList(payload.data)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setCharactersErrorMessage(toUserFriendlyCharactersError(error, searchValue.trim().length > 0))
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
  }, [isAuthLoading, sessionUserId, activeCategory, searchValue])

  useEffect(() => {
    if (!actionAlertMessage) {
      return
    }

    const timeout = window.setTimeout(() => {
      setActionAlertMessage(null)
    }, 4200)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [actionAlertMessage])

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
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-4 py-10 sm:px-5 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_0%,rgba(244,99,19,0.15),transparent_32%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-[40px] font-semibold italic leading-[0.95] text-white sm:text-5xl md:text-6xl">
            AI Anime Girlfriend
          </h1>

          <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:gap-3 lg:gap-4">
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

            <div className="w-full xl:max-w-[370px]">
              <SearchField
                value={searchValue}
                onChange={handleSearchChange}
                placeholder="Search:  ..."
                ariaLabel="Search AI girlfriends"
                inputClassName="min-h-[52px] w-full rounded-2xl border border-white/25 bg-[#06080c]/90 px-4 text-[16px] font-[family-name:var(--font-heading)] font-medium text-[#d2d3d8] outline-none transition placeholder:text-[#8b8f96] focus:border-ember-300 sm:min-h-[45px] sm:rounded-[10px] sm:text-[18px] md:text-[23px]"
              />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-3 lg:grid-cols-4">
            {isCharactersLoading ? (
              <p className="col-span-full text-[15px] text-white/70 sm:text-sm">Loading AI girlfriends...</p>
            ) : null}
            {!isCharactersLoading && charactersErrorMessage ? (
              <p className="col-span-full rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-[15px] text-rose-100 sm:rounded-md sm:text-sm">
                {charactersErrorMessage}
              </p>
            ) : null}
            {!isCharactersLoading &&
            !charactersErrorMessage &&
            paginatedCharacters.length === 0 &&
            !isMaintenanceActive ? (
              <p className="col-span-full text-[15px] text-white/70 sm:text-sm">No AI girlfriends match this filter.</p>
            ) : null}
            {!isCharactersLoading && !charactersErrorMessage
              ? paginatedCharacters.map((characterItem, index) => {
                  return (
                    <CharacterGalleryCard
                      key={characterItem.id}
                      routeId={buildAiGirlfriendRouteKey(characterItem.name, characterItem.id)}
                      name={characterItem.name}
                      likes={formatCompactCount(characterItem.heartsCount)}
                      messages={formatCompactCount(characterItem.messageCount)}
                      gradientClassName={defaultGradientVariants[index % defaultGradientVariants.length]}
                      className="w-full overflow-hidden rounded-[26px] border border-[#8a4f2b]/80 bg-[#111111] shadow-[0_18px_34px_rgba(0,0,0,0.4)]"
                      tagline={characterItem.tagline ?? undefined}
                      description={characterItem.description ?? undefined}
                      previewImageUrl={characterItem.previewImageUrl}
                      cardThumbnailDesktopUrl={characterItem.cardThumbnailDesktopUrl}
                      cardThumbnailMobileUrl={characterItem.cardThumbnailMobileUrl}
                      moderationStatus={characterItem.status}
                      showModerationBadge={activeCategory === 'your-characters'}
                      suppressPendingModerationBadge={
                        activeCategory === 'your-characters' && sessionUser?.role === 'ADMIN'
                      }
                      onActionClick={(event) => {
                        if (activeCategory !== 'your-characters') {
                          return
                        }

                        if (sessionUser?.role === 'ADMIN') {
                          if (characterItem.status === 'DRAFT') {
                            event.preventDefault()
                            event.stopPropagation()
                            setActionAlertMessage(
                              'This character is still a draft. Publish it from admin tools before opening chat.'
                            )
                          }
                          return
                        }

                        if (characterItem.status === 'APPROVED') {
                          return
                        }

                        event.preventDefault()
                        event.stopPropagation()

                        if (characterItem.status === 'REJECTED') {
                          setActionAlertMessage('This character was rejected. Please update it and resubmit for approval before chatting.')
                          return
                        }

                        setActionAlertMessage('This character must be approved before you can chat.')
                      }}
                    />
                  )
                })
              : null}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 text-center">
            <PaginationControls currentPage={visiblePage} totalPages={totalPages} onPageChange={setCurrentPage} />
            <p className="text-[14px] text-white/75 sm:text-xs">
              {filteredAndSortedCharacters.length} AI Anime Girlfriends
            </p>
          </div>
        </div>

        {actionAlertMessage ? (
          <div className="fixed bottom-4 left-4 right-4 z-50 rounded-xl border border-rose-300/35 bg-[#2a1212]/95 px-4 py-3 text-[14px] text-rose-100 shadow-[0_14px_35px_rgba(0,0,0,0.5)] sm:bottom-5 sm:left-auto sm:right-5 sm:max-w-[420px] sm:rounded-md sm:text-xs">
            {actionAlertMessage}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default CharactersPage
