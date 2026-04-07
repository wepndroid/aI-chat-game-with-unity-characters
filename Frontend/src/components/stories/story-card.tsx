'use client'

import type { StoryListRecord } from '@/lib/story-api'
import Link from 'next/link'

type StoryCardProps = {
  story: StoryListRecord
  /** When set, heart/count is shown as non-interactive for the viewer’s own stories. */
  currentUserId?: string | null
}

const formatRelativeTime = (dateString: string) => {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)

  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)

  if (days < 30) return `${days}d ago`

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(dateString))
}

const StoryCard = ({ story, currentUserId }: StoryCardProps) => {
  const isOwnStory = Boolean(currentUserId && story.author.id === currentUserId)

  return (
    <Link
      href={`/stories/${story.id}`}
      className="group block rounded-xl border border-white/10 bg-[#0d0f14]/80 p-5 transition hover:border-ember-300/30 hover:bg-[#13151c]/90"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-medium text-white group-hover:text-ember-200 transition line-clamp-2">
          {story.title}
        </h3>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          {story.publicationStatus === 'DRAFT' ? (
            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-200/90">
              Draft
            </span>
          ) : null}
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/50">
            {formatRelativeTime(story.createdAt)}
          </span>
        </span>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-white/55 line-clamp-3">{story.bodyPreview}</p>

      <div className="mt-4 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">
        <span>by {story.author.username}</span>
        {story.character ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember-400/60" />
            {story.character.name}
          </span>
        ) : null}
        <span
          className={`ml-auto flex items-center gap-1 ${isOwnStory ? 'text-white/25' : ''}`}
          title={isOwnStory ? "You can’t like your own story" : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 ${isOwnStory ? 'opacity-50' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {story.likesCount}
        </span>
      </div>
    </Link>
  )
}

export default StoryCard
