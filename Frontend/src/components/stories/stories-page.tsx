'use client'

import { useAuth } from '@/components/providers/auth-provider'
import FilterTab from '@/components/ui-elements/filter-tab'
import SearchField from '@/components/ui-elements/search-field'
import StoryCard from '@/components/stories/story-card'
import { listStories, type StoryListRecord } from '@/lib/story-api'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type StoryScope = 'all' | 'mine'
type MinePublicationFilter = 'all' | 'draft' | 'published' | 'rejected'

const scopeTabs: Array<{ key: StoryScope; label: string; shortLabel: string }> = [
  { key: 'all', label: 'All Stories', shortLabel: 'All' },
  { key: 'mine', label: 'My Stories', shortLabel: 'Mine' }
]

const minePublicationTabs: Array<{ key: MinePublicationFilter; label: string; shortLabel: string }> = [
  { key: 'all', label: 'All', shortLabel: 'All' },
  { key: 'published', label: 'Published', shortLabel: 'Pub.' },
  { key: 'draft', label: 'Drafts', shortLabel: 'Draft' },
  { key: 'rejected', label: 'Rejected', shortLabel: 'Rej.' }
]

const StoriesPage = () => {
  const { sessionUser, isAuthLoading } = useAuth()
  const sessionUserId = sessionUser?.id ?? null
  const [activeScope, setActiveScope] = useState<StoryScope>('all')
  const [minePublication, setMinePublication] = useState<MinePublicationFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'likes'>('newest')
  const [stories, setStories] = useState<StoryListRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (activeScope === 'mine' && !sessionUserId) {
      setStories([])
      setErrorMessage('Sign in to view your stories.')
      setIsLoading(false)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      if (isCancelled) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await listStories({
          scope: activeScope,
          publication: activeScope === 'mine' ? minePublication : undefined,
          search: searchValue || undefined,
          sort: sortBy,
          limit: 50
        })

        if (!isCancelled) {
          setStories(payload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load stories.')
          setStories([])
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => { isCancelled = true }
  }, [isAuthLoading, sessionUserId, activeScope, minePublication, searchValue, sortBy])

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_0%,rgba(244,99,19,0.13),transparent_32%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white sm:text-5xl md:text-6xl">
              Stories
            </h1>
            {sessionUser ? (
              <Link
                href="/stories/create"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:bg-[#3a1d13] sm:w-auto"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                New Story
              </Link>
            ) : null}
          </div>

          <div className="mt-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-4">
                {scopeTabs.map((tab) => (
                  <FilterTab
                    key={tab.key}
                    label={tab.label}
                    shortLabel={tab.shortLabel}
                    isActive={activeScope === tab.key}
                    onClick={() => {
                      setActiveScope(tab.key)
                      if (tab.key === 'all') {
                        setMinePublication('all')
                      }
                    }}
                    ariaLabel={`Filter by ${tab.label}`}
                  />
                ))}
              </div>

              {activeScope === 'mine' && sessionUserId ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-t border-white/10 pt-3">
                  {minePublicationTabs.map((tab) => (
                    <FilterTab
                      key={tab.key}
                      label={tab.label}
                      shortLabel={tab.shortLabel}
                      isActive={minePublication === tab.key}
                      onClick={() => setMinePublication(tab.key)}
                      ariaLabel={`Show ${tab.label} stories`}
                    />
                  ))}
                </div>
              ) : null}

              <div className="flex min-h-[44px] w-full items-center border-t border-white/10 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className={`min-h-[44px] min-w-[44px] touch-manipulation px-2 transition ${sortBy === 'newest' ? 'text-ember-300' : 'hover:text-white/70'}`}
                    onClick={() => setSortBy('newest')}
                  >
                    Newest
                  </button>
                  <span className="text-white/25">/</span>
                  <button
                    type="button"
                    className={`min-h-[44px] min-w-[44px] touch-manipulation px-2 transition ${sortBy === 'likes' ? 'text-ember-300' : 'hover:text-white/70'}`}
                    onClick={() => setSortBy('likes')}
                  >
                    Popular
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full min-w-0 shrink-0 lg:max-w-[370px]">
              <SearchField
                value={searchValue}
                onChange={setSearchValue}
                placeholder="Search stories..."
                ariaLabel="Search stories"
                inputClassName="h-[45px] w-full rounded-[10px] border border-white/25 bg-[#06080c]/90 px-4 text-[18px] font-[family-name:var(--font-heading)] font-medium text-[#d2d3d8] outline-none transition placeholder:text-[#8b8f96] focus:border-ember-300 md:text-[23px]"
              />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {isLoading ? (
              <p className="col-span-full text-sm text-white/70">Loading stories...</p>
            ) : null}

            {!isLoading && errorMessage ? (
              <p className="col-span-full rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </p>
            ) : null}

            {!isLoading && !errorMessage && stories.length === 0 ? (
              <div className="col-span-full py-16 text-center">
                <p className="text-sm text-white/55">
                  {activeScope === 'mine'
                    ? minePublication === 'draft'
                      ? 'You have no drafts. Save a story as a draft from the editor to see it here.'
                      : minePublication === 'published'
                        ? 'You have no published stories yet.'
                        : minePublication === 'rejected'
                          ? 'You have no rejected stories. Submissions that moderators reject will appear here.'
                          : "You haven't written any stories yet."
                    : 'No stories have been published yet. Be the first!'}
                </p>
                {sessionUser ? (
                  <Link
                    href="/stories/create"
                    className="mt-4 inline-block rounded-lg border border-ember-500/50 bg-[#2b160f]/70 px-5 py-2.5 text-sm font-semibold text-ember-100 transition hover:bg-[#3a1d13]"
                  >
                    Write a story
                  </Link>
                ) : null}
              </div>
            ) : null}

            {!isLoading && !errorMessage
              ? stories.map((story) => (
                  <StoryCard
                  key={story.id}
                  story={story}
                  currentUserId={sessionUserId}
                  showOwnerStatusBadges={activeScope === 'mine'}
                />
                ))
              : null}
          </div>

          {!isLoading && stories.length > 0 ? (
            <p className="mt-8 text-center text-xs text-white/50">
              {stories.length} {stories.length === 1 ? 'story' : 'stories'}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  )
}

export default StoriesPage
