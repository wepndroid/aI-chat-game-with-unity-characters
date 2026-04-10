'use client'

import FilterTab from '@/components/ui-elements/filter-tab'
import StartChatIcon from '@/components/ui-elements/start-chat-icon'
import type { CharacterDetailRecord } from '@/lib/character-api'
import type { StoryListRecord } from '@/lib/story-api'
import { StoryBodyMarkupPreview } from '@/lib/story-body-markup-preview'
import { scenarioTypeBadgeClass, scenarioTypeDisplayLabel } from '@/lib/story-scenario-types'
import Link from 'next/link'

type CommunitySortMode = 'trending' | 'newest'

type CharacterCommunityStoriesProps = {
  character: CharacterDetailRecord
  stories: StoryListRecord[]
  /** Set when the list API failed (e.g. validation or network); avoids a silent empty list that looks like “no scenarios”. */
  storiesLoadError?: string | null
  isLoading: boolean
  sortMode: CommunitySortMode
  onSortChange: (mode: CommunitySortMode) => void
  officialPlayHref: string
  buildScenarioPlayHref: (storyId: string) => string
  /** Only the character owner gets a Write scenario link. */
  writeStoryHref: string | null
  /** Used for heart rules (e.g. authors and character owner cannot like). */
  viewerUserId?: string | null
  onPlayIntent: () => void
  onOfficialHeartClick: () => void
  officialHeartDisabled: boolean
  onStoryHeartClick: (storyId: string) => void
  storyHeartSubmittingId: string | null
}

const formatCompactNumber = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

const splitScenarioPreview = (raw: string) => {
  const cleaned = raw.replace(/\.\.\.$/, '').trim()
  const firstBreak = cleaned.search(/[.!?]\s+/)
  if (firstBreak > 40 && firstBreak < cleaned.length - 20) {
    const a = cleaned.slice(0, firstBreak + 1).trim()
    const b = cleaned.slice(firstBreak + 1).trim()
    return { setup: a, narrative: b, dialogue: b }
  }
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length >= 2) {
    return { setup: lines[0] ?? cleaned, narrative: lines.slice(1).join(' '), dialogue: lines.slice(1).join(' ') }
  }
  const half = Math.floor(cleaned.length / 2)
  return {
    setup: cleaned.slice(0, half),
    narrative: cleaned.slice(half),
    dialogue: cleaned.slice(half)
  }
}

const ChatStatIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.75c-4.97 0-9 3.32-9 7.43 0 2.61 1.65 4.9 4.14 6.22-.09 1.11-.4 2.26-1.12 3.03a.6.6 0 0 0 .58 1.01c1.92-.35 3.49-1.2 4.45-1.86.31.03.62.05.95.05 4.97 0 9-3.32 9-7.43S16.97 2.75 12 2.75Z"
        fill="#f19147"
      />
      <circle cx="8.5" cy="10.3" r="1.05" fill="#1f120d" />
      <circle cx="12" cy="10.3" r="1.05" fill="#1f120d" />
      <circle cx="15.5" cy="10.3" r="1.05" fill="#1f120d" />
    </svg>
  )
}

const HeartStatIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.03 6.03 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z"
        fill="#f75de8"
      />
    </svg>
  )
}

/** Desaturated stats row for community (non-official) cards — matches reference: gray icons + type, no accent colors. */
const communityStatRowClass =
  'text-[11px] font-bold uppercase tracking-[0.1em] text-[#9a9a9a]'

const ChatStatIconMuted = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 text-[#9a9a9a] ${className}`} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.75c-4.97 0-9 3.32-9 7.43 0 2.61 1.65 4.9 4.14 6.22-.09 1.11-.4 2.26-1.12 3.03a.6.6 0 0 0 .58 1.01c1.92-.35 3.49-1.2 4.45-1.86.31.03.62.05.95.05 4.97 0 9-3.32 9-7.43S16.97 2.75 12 2.75Z"
      />
    </svg>
  )
}

const HeartStatIconMuted = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 text-[#9a9a9a] ${className}`} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.03 6.03 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z"
      />
    </svg>
  )
}

const CharacterCommunityStories = ({
  character,
  stories,
  storiesLoadError,
  isLoading,
  sortMode,
  onSortChange,
  officialPlayHref,
  buildScenarioPlayHref,
  writeStoryHref,
  viewerUserId,
  onPlayIntent,
  onOfficialHeartClick,
  officialHeartDisabled,
  onStoryHeartClick,
  storyHeartSubmittingId
}: CharacterCommunityStoriesProps) => {
  const viewerIsCharacterOwner = Boolean(viewerUserId && character.owner.id === viewerUserId)
  const displayName = (character.fullName?.trim() || character.name).trim()
  const scenarioText = (character.scenario?.trim() || character.description?.trim() || 'No scenario text yet.') ?? ''
  const firstMsg = character.firstMessage?.trim() || ''

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-[20px] font-semibold italic uppercase text-white">
            Community stories
          </h2>
          <p className="mt-1 text-xs text-white/55">Select a scenario to start chatting.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-6 sm:gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-4">
            <FilterTab
              label="Trending"
              shortLabel="Hot"
              isActive={sortMode === 'trending'}
              onClick={() => onSortChange('trending')}
              ariaLabel="Sort by trending"
            />
            <span className="hidden text-white/25 sm:inline">/</span>
            <FilterTab
              label="Newest"
              shortLabel="New"
              isActive={sortMode === 'newest'}
              onClick={() => onSortChange('newest')}
              ariaLabel="Sort by newest"
            />
          </div>
          {writeStoryHref ? (
            <Link
              href={writeStoryHref}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:bg-[#3a1d13] sm:w-auto"
            >
              Write scenario
            </Link>
          ) : null}
        </div>
      </div>

      <article className="mt-6 min-w-0 overflow-x-hidden rounded-md border border-white/10 bg-[#1a1213] p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 max-w-full font-[family-name:var(--font-heading)] text-[36px] font-semibold italic uppercase leading-none text-white [overflow-wrap:anywhere]">
                {displayName}
              </h3>
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-200/90">
                Official story
              </span>
            </div>
            <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-white/45">
              Created by {character.officialListing ? 'admin' : character.owner.username}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <ChatStatIcon className="size-[18px]" />
                {formatCompactNumber(character.viewsCount)} chats
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HeartStatIcon className="size-[18px]" />
                {formatCompactNumber(character.heartsCount)} likes
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onOfficialHeartClick}
            disabled={officialHeartDisabled}
            className={`inline-flex size-[30px] shrink-0 items-center justify-center rounded-full border text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
              officialHeartDisabled
                ? 'border-[#5c4a42]/45 bg-[#1f1815] text-white/30'
                : character.hasHearted
                  ? 'border-[#ff74d8] bg-[#3a102c] text-[#ffd8f4] shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_0_18px_rgba(247,93,232,0.45)]'
                  : 'border-[#775844] bg-[#261c17] text-white/95 hover:border-[#8f6447] hover:bg-[#2c201a]'
            }`}
            aria-label={character.hasHearted ? 'Remove favorite' : 'Favorite character'}
          >
            <svg viewBox="0 0 24 24" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
              <path
                d="m12 20.2-.78-.7C6.46 15.21 3.5 12.53 3.5 9.23 3.5 6.55 5.6 4.5 8.25 4.5c1.5 0 2.95.7 3.75 1.82A4.83 4.83 0 0 1 15.75 4.5c2.66 0 4.75 2.05 4.75 4.73 0 3.3-2.96 5.98-7.72 10.27l-.78.7Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-6 grid min-w-0 grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
          <p className="min-w-0 max-w-full whitespace-pre-line text-[11px] leading-[1.75] text-white/75 [overflow-wrap:anywhere]">{scenarioText}</p>
          <div className="min-w-0 rounded-md border border-white/10 bg-[#121010] p-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.11em] text-[#f59e0b]">First message</p>
            <p className="mt-3 min-w-0 max-w-full whitespace-pre-wrap text-[11px] italic leading-relaxed text-white/75 [overflow-wrap:anywhere]">
              {firstMsg || '—'}
            </p>
          </div>
        </div>

        <div className="mt-8">
          <Link
            href={officialPlayHref}
            onClick={() => {
              if (officialPlayHref.startsWith('/play-demo')) {
                onPlayIntent()
              }
            }}
            className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[20px] font-semibold italic uppercase leading-none text-white transition hover:brightness-110"
          >
            Start chapter
            <span className="text-white/95">
              <StartChatIcon className="size-8" />
            </span>
          </Link>
        </div>
      </article>

      <div className="mt-8 space-y-5">
        {isLoading ? (
          <p className="text-sm text-white/55">Loading scenarios…</p>
        ) : storiesLoadError ? (
          <div className="rounded-md border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-100/95">
            <p className="font-semibold text-amber-50">Community scenarios could not be loaded</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/80">{storiesLoadError}</p>
            <p className="mt-2 text-[11px] text-amber-100/60">Refresh the page after a moment. If this persists, check that the API URL is correct.</p>
          </div>
        ) : stories.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-[#1a1213] px-5 py-12 text-center">
            <p className="text-sm text-white/55">No community scenarios yet.</p>
            <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-white/40">
              Scenarios show here only when they are published with this character linked.
              {writeStoryHref
                ? ' If you already published one, edit it and choose this character.'
                : ' Only the character owner can add scenarios for this page.'}
            </p>
            {!writeStoryHref ? (
              <p className="mt-4 text-xs text-white/40">
                Only the character owner can add the first community scenario.
              </p>
            ) : null}
          </div>
        ) : (
          stories.map((story) => {
            const scenarioLabel = scenarioTypeDisplayLabel(story.scenarioType)
            const scenarioBadge = scenarioTypeBadgeClass(story.scenarioType)
            const leftRaw = story.scenarioStory?.trim() ?? ''
            const rightRaw = story.scenarioChat?.trim() ?? ''
            const fallbackRaw = story.bodyPreview.replace(/\.\.\.$/, '').trim()
            let setupText: string
            let narrativeForPreview: string
            let dialogueForPreview: string

            if (rightRaw.length > 0) {
              setupText = leftRaw
              const parts = splitScenarioPreview(rightRaw)
              narrativeForPreview = parts.narrative
              dialogueForPreview = parts.dialogue
            } else if (leftRaw.length > 0) {
              const parts = splitScenarioPreview(leftRaw)
              setupText = parts.setup
              narrativeForPreview = parts.narrative
              dialogueForPreview = parts.dialogue
            } else {
              const parts = splitScenarioPreview(fallbackRaw)
              setupText = parts.setup
              narrativeForPreview = parts.narrative
              dialogueForPreview = parts.dialogue
            }

            const showNarrationBlock = Boolean(narrativeForPreview && narrativeForPreview !== dialogueForPreview)
            const sampleDialogueText = dialogueForPreview.trim() || fallbackRaw
            const isStoryAuthor = Boolean(viewerUserId && story.author.id === viewerUserId)
            const storyHeartDisabled =
              viewerIsCharacterOwner || isStoryAuthor || storyHeartSubmittingId === story.id
            const storyHasLiked = Boolean(story.hasLiked)
            return (
              <article key={story.id} className="min-w-0 overflow-x-hidden rounded-md border border-white/10 bg-[#1a1213] p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 max-w-full font-[family-name:var(--font-heading)] text-[36px] font-semibold italic uppercase leading-none text-white [overflow-wrap:anywhere]">
                        {story.title}
                      </h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${scenarioBadge}`}
                      >
                        {scenarioLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-white/45">
                      Created by {story.author.username}
                    </p>
                    <div className={`mt-2 flex flex-wrap items-center gap-6 ${communityStatRowClass}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <ChatStatIconMuted className="size-[18px]" />
                        <span>chats</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <HeartStatIconMuted className="size-[18px]" />
                        <span>
                          {formatCompactNumber(story.likesCount)} likes
                        </span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStoryHeartClick(story.id)}
                    disabled={storyHeartDisabled}
                    className={`inline-flex size-[30px] shrink-0 items-center justify-center rounded-full border text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      storyHeartDisabled
                        ? 'border-[#5c4a42]/45 bg-[#1f1815] text-white/30'
                        : storyHasLiked
                          ? 'border-[#ff74d8] bg-[#3a102c] text-[#ffd8f4] shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_0_18px_rgba(247,93,232,0.45)]'
                          : 'border-[#775844] bg-[#261c17] text-white/95 hover:border-[#8f6447] hover:bg-[#2c201a]'
                    }`}
                    aria-label={storyHasLiked ? 'Unlike scenario' : 'Like scenario'}
                  >
                    <svg viewBox="0 0 24 24" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                      <path
                        d="m12 20.2-.78-.7C6.46 15.21 3.5 12.53 3.5 9.23 3.5 6.55 5.6 4.5 8.25 4.5c1.5 0 2.95.7 3.75 1.82A4.83 4.83 0 0 1 15.75 4.5c2.66 0 4.75 2.05 4.75 4.73 0 3.3-2.96 5.98-7.72 10.27l-.78.7Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
                  <p className="min-w-0 max-w-full whitespace-pre-line text-[11px] leading-[1.75] text-white/75 [overflow-wrap:anywhere]">{setupText}</p>
                  <div className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#121010] p-4">
                    <p className="text-[8px] font-bold uppercase tracking-[0.11em] text-[#f59e0b]">Preview</p>
                    <div className="mt-3 min-w-0 space-y-2">
                      {showNarrationBlock ? (
                        <div className="min-w-0 italic text-white/50">
                          <StoryBodyMarkupPreview
                            text={narrativeForPreview}
                            scenarioType={story.scenarioType}
                            className="text-[11px] leading-relaxed"
                          />
                        </div>
                      ) : null}
                      <StoryBodyMarkupPreview
                        text={showNarrationBlock ? dialogueForPreview : sampleDialogueText}
                        scenarioType={story.scenarioType}
                        className={`text-[11px] leading-relaxed ${showNarrationBlock ? 'mt-1' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <Link
                    href={buildScenarioPlayHref(story.id)}
                    onClick={() => {
                      const href = buildScenarioPlayHref(story.id)
                      if (href.startsWith('/play-demo')) {
                        onPlayIntent()
                      }
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-ember-500/50 bg-[#2b160f]/70 px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:bg-[#3a1d13]"
                  >
                    Play scenario
                  </Link>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

export default CharacterCommunityStories
