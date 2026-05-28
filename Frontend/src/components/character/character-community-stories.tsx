'use client'

import {
  scenarioStatusLabel,
  scenarioStatusPillClass
} from '@/components/your-characters/your-scenarios-helpers'
import { useWebglPreloadIntent } from '@/components/providers/webgl-preload-provider'
import FilterTab from '@/components/ui-elements/filter-tab'
import FirstMessagePreviewBox from '@/components/ui-elements/first-message-preview-box'
import StartChatIcon from '@/components/ui-elements/start-chat-icon'
import type { CharacterDetailRecord } from '@/lib/character-api'
import { formatCompactCount } from '@/lib/format-compact-count'
import type { StoryListRecord } from '@/lib/story-api'
import { buildPrimaryCharacterStoryCardDisplay } from '@/components/character/character-story-catalog-display-policy'
import Link from 'next/link'
import type { MouseEvent } from 'react'

type CommunitySortMode = 'trending' | 'newest'

type CharacterCommunityStoriesProps = {
  character: CharacterDetailRecord
  officialStory: StoryListRecord | null
  stories: StoryListRecord[]
  /** Set when the list API failed (e.g. validation or network); avoids a silent empty list that looks like "no scenarios". */
  storiesLoadError?: string | null
  isLoading: boolean
  sortMode: CommunitySortMode
  onSortChange: (mode: CommunitySortMode) => void
  officialPlayHref: string | null
  onOfficialPlayClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  officialStoryLikesCount: number
  officialStoryHasLiked: boolean
  buildScenarioPlayHref: (storyId: string) => string
  onScenarioPlayClick?: (event: MouseEvent<HTMLAnchorElement>, storyId: string) => void
  buildScenarioEditHref: (story: StoryListRecord) => string
  /** Set when the current viewer can start the create-story flow from this character page. */
  writeStoryHref: string | null
  /** Used for heart rules (e.g. authors and character owner cannot like). */
  viewerUserId?: string | null
  /** Signed-in viewer's linked stories that are not public yet. */
  viewerLinkedStories: StoryListRecord[]
  onOfficialHeartClick: () => void
  officialHeartDisabled: boolean
  onStoryHeartClick: (storyId: string) => void
  storyHeartSubmittingId: string | null
}

const getStoryBadges = (story: Pick<StoryListRecord, 'origin' | 'isDefault'> | null | undefined) => {
  if (!story) {
    return []
  }

  return [
    story.origin === 'OFFICIAL' ? 'Official' : 'Community',
    ...(story.isDefault ? ['Default'] : [])
  ]
}

const StoryBadgeList = ({ story }: { story: Pick<StoryListRecord, 'origin' | 'isDefault'> | null | undefined }) => {
  const badges = getStoryBadges(story)

  if (badges.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-md border border-[#e67d34]/45 bg-[#e67d34]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#ffb06c]"
        >
          {badge}
        </span>
      ))}
    </div>
  )
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
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length >= 2) {
    const joined = lines.slice(1).join(' ')
    return { setup: lines[0] ?? cleaned, narrative: joined, dialogue: joined }
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

const CharacterCommunityStories = ({
  character,
  officialStory,
  stories,
  storiesLoadError,
  isLoading,
  sortMode,
  onSortChange,
  officialPlayHref,
  onOfficialPlayClick,
  officialStoryLikesCount,
  officialStoryHasLiked,
  buildScenarioPlayHref,
  onScenarioPlayClick,
  buildScenarioEditHref,
  writeStoryHref,
  viewerUserId,
  viewerLinkedStories,
  onOfficialHeartClick,
  officialHeartDisabled,
  onStoryHeartClick,
  storyHeartSubmittingId
}: CharacterCommunityStoriesProps) => {
  const { preloadOnIntent } = useWebglPreloadIntent()
  const viewerIsCharacterOwner = Boolean(viewerUserId && character.owner.id === viewerUserId)
  const primaryStoryDisplay = buildPrimaryCharacterStoryCardDisplay({
    character,
    story: officialStory
  })
  const totalVisibleStories = stories.length + viewerLinkedStories.length

  return (
    <section className="min-w-0">
      <article className="min-w-0 overflow-hidden rounded-[24px] border border-[#d97a3a]/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <StoryBadgeList story={officialStory} />
            <h2 className="mt-3 min-w-0 max-w-full font-[family-name:var(--font-heading)] text-[24px] font-semibold italic uppercase leading-none text-white [overflow-wrap:anywhere] md:text-[30px]">
              {primaryStoryDisplay.title}
            </h2>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/45">
              Created by {primaryStoryDisplay.creatorName}
            </p>
            <p className="mt-5 max-w-3xl whitespace-pre-line text-[14px] leading-7 text-white/76 [overflow-wrap:anywhere]">
              {primaryStoryDisplay.scenarioText}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-5 text-[11px] font-medium text-white/42">
              <span className="inline-flex items-center gap-2">
                <ChatStatIcon className="size-[18px]" />
                {formatCompactCount(character.messageCount)} messages
              </span>
              <span className="inline-flex items-center gap-2">
                <HeartStatIcon className="size-[18px]" />
                {formatCompactCount(officialStoryLikesCount)} likes
              </span>
            </div>
            <details className="group mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[#ff8a37] transition hover:text-[#ffa15b] [&::-webkit-details-marker]:hidden">
                View First Message
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 transition group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="mt-4">
                <FirstMessagePreviewBox firstMessage={primaryStoryDisplay.firstMessage || null} />
              </div>
            </details>
          </div>
          <button
            type="button"
            onClick={onOfficialHeartClick}
            disabled={officialHeartDisabled}
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
              officialHeartDisabled
                ? 'border-[#5c4a42]/45 bg-[#1f1815] text-white/30'
                : officialStoryHasLiked
                  ? 'border-[#ff74d8] bg-[#3a102c] text-[#ffd8f4] shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_0_18px_rgba(247,93,232,0.45)]'
                  : 'border-[#775844] bg-[#261c17] text-white/95 hover:border-[#8f6447] hover:bg-[#2c201a]'
            }`}
            aria-label={officialStoryHasLiked ? 'Unlike official scenario' : 'Like official scenario'}
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

        <div className="mt-7">
          {officialPlayHref ? (
            <Link
              href={officialPlayHref}
              onClick={onOfficialPlayClick}
              onPointerEnter={preloadOnIntent}
              onFocus={preloadOnIntent}
              onTouchStart={preloadOnIntent}
              className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-[14px] bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[17px] font-semibold italic uppercase tracking-[0.06em] leading-none text-white shadow-[0_16px_30px_rgba(244,99,19,0.28)] transition hover:brightness-110"
            >
              <StartChatIcon className="size-6 text-white" />
              START CHAT
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-14 w-full cursor-not-allowed items-center justify-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.06] px-5 font-[family-name:var(--font-heading)] text-[17px] font-semibold italic uppercase tracking-[0.06em] leading-none text-white/45"
            >
              <StartChatIcon className="size-6 text-white/45" />
              START CHAT
            </button>
          )}
        </div>
      </article>

      <div className="mt-10 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-semibold italic uppercase tracking-[0.08em] text-white md:text-[22px]">
              Community stories
            </h2>
            <span className="rounded-md border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
              {totalVisibleStories > 0 ? `${totalVisibleStories} visible to you` : 'No stories yet'}
            </span>
          </div>
          {writeStoryHref ? (
            <Link
              href={writeStoryHref}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-white/90 transition hover:border-white/20 hover:bg-white/[0.09] sm:self-auto"
            >
              <span className="text-[22px] leading-none">+</span>
              Create Custom Story
            </Link>
          ) : null}
        </div>
        {viewerLinkedStories.length > 0 ? (
          <div className="rounded-[18px] border border-amber-400/20 bg-amber-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-amber-100">Your custom stories for this character</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
              These are visible only to you until they are approved. That is why they do not appear in the public community list for other people yet.
            </p>
            <div className="mt-4 space-y-3">
              {viewerLinkedStories.map((story) => (
                <div
                  key={story.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-[family-name:var(--font-heading)] text-[18px] font-semibold italic text-white">
                        {story.title}
                      </p>
                      <StoryBadgeList story={story} />
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${scenarioStatusPillClass(story)}`}
                      >
                        {scenarioStatusLabel(story)}
                      </span>
                    </div>
                    {story.moderationStatus === 'REJECTED' && story.moderationRejectReason?.trim() ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                        {story.moderationRejectReason.trim()}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={buildScenarioEditHref(story)}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold uppercase tracking-[0.08em] text-white/90 transition hover:border-white/25 hover:bg-white/[0.1]"
                  >
                    Edit scenario
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <FilterTab
            label="Trending"
            shortLabel="Hot"
            isActive={sortMode === 'trending'}
            onClick={() => onSortChange('trending')}
            ariaLabel="Sort by trending"
          />
          <FilterTab
            label="Newest"
            shortLabel="New"
            isActive={sortMode === 'newest'}
            onClick={() => onSortChange('newest')}
            ariaLabel="Sort by newest"
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {isLoading ? (
          <p className="xl:col-span-2 text-sm text-white/55">Loading scenarios...</p>
        ) : storiesLoadError ? (
          <div className="xl:col-span-2 rounded-[18px] border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-100/95">
            <p className="font-semibold text-amber-50">Community scenarios could not be loaded</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/80">{storiesLoadError}</p>
            <p className="mt-2 text-[11px] text-amber-100/60">
              Refresh the page after a moment. If this persists, check that the API URL is correct.
            </p>
          </div>
        ) : stories.length === 0 ? (
          <div className="xl:col-span-2 rounded-[18px] border border-white/10 bg-white/[0.03] px-5 py-12 text-center">
            <p className="text-sm text-white/55">No community scenarios yet.</p>
            <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-white/40">
              Scenarios show here only when they are published with this character linked.
              {writeStoryHref
                ? ' Create a new scenario from this page to link it to this character.'
                : ' Sign in to create the first scenario for this character.'}
            </p>
            {!writeStoryHref ? (
              <p className="mt-4 text-xs text-white/40">Any signed-in user can add the first community scenario.</p>
            ) : null}
          </div>
        ) : (
          stories.map((story) => {
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
            const storyPreviewText = showNarrationBlock
              ? `${narrativeForPreview.trim()}\n\n${dialogueForPreview.trim()}`.trim()
              : sampleDialogueText

            return (
              <article
                key={story.id}
                className="flex min-w-0 flex-col overflow-x-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_42px_rgba(0,0,0,0.22)] md:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="min-w-0 max-w-full font-[family-name:var(--font-heading)] text-[22px] font-semibold italic uppercase leading-none text-white [overflow-wrap:anywhere] md:text-[26px]">
                      {story.title}
                    </h3>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/45">
                      Created by {story.author.username}
                    </p>
                    <div className="mt-3">
                      <StoryBadgeList story={story} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-5 text-[11px] font-medium text-white/42">
                      <span className="inline-flex items-center gap-2">
                        <HeartStatIcon className="size-[18px]" />
                        {formatCompactCount(story.likesCount)} likes
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
                    <svg
                      viewBox="0 0 24 24"
                      className="size-[16px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      aria-hidden
                    >
                      <path
                        d="m12 20.2-.78-.7C6.46 15.21 3.5 12.53 3.5 9.23 3.5 6.55 5.6 4.5 8.25 4.5c1.5 0 2.95.7 3.75 1.82A4.83 4.83 0 0 1 15.75 4.5c2.66 0 4.75 2.05 4.75 4.73 0 3.3-2.96 5.98-7.72 10.27l-.78.7Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className="mt-4 flex flex-1 flex-col gap-4">
                  <p className="min-w-0 max-w-full whitespace-pre-line text-[14px] leading-7 text-white/73 [overflow-wrap:anywhere]">
                    <span className="[display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                      {setupText}
                    </span>
                  </p>
                  <details className="group rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[#ff8a37] transition hover:text-[#ffa15b] [&::-webkit-details-marker]:hidden">
                      View First Message
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4 transition group-open:rotate-180"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <div className="mt-4">
                      <FirstMessagePreviewBox firstMessage={storyPreviewText} />
                    </div>
                  </details>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                  <Link
                    href={buildScenarioPlayHref(story.id)}
                    onClick={(event) => onScenarioPlayClick?.(event, story.id)}
                    onPointerEnter={preloadOnIntent}
                    onFocus={preloadOnIntent}
                    onTouchStart={preloadOnIntent}
                    className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-[14px] border border-[#7b5335] bg-[linear-gradient(180deg,#332118,#271811)] px-5 font-[family-name:var(--font-heading)] text-[17px] font-semibold italic uppercase tracking-[0.06em] leading-none text-[#ffd8bf] shadow-[0_12px_24px_rgba(0,0,0,0.22)] transition hover:border-[#9d6843] hover:bg-[linear-gradient(180deg,#3d281d,#2d1c14)]"
                  >
                    <StartChatIcon className="size-6 text-[#ffcfab]" />
                    START CHAT
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
