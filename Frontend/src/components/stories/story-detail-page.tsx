'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { deleteStory, getStory, toggleStoryLike, updateStory, type StoryDetailRecord } from '@/lib/story-api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type StoryDetailPageProps = {
  storyId: string
}

const formatFullDate = (dateString: string) => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString))
}

const StoryDetailPage = ({ storyId }: StoryDetailPageProps) => {
  const router = useRouter()
  const { sessionUser, isAuthLoading } = useAuth()
  const [story, setStory] = useState<StoryDetailRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLiking, setIsLiking] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      if (isCancelled) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await getStory(storyId)

        if (!isCancelled) {
          setStory(payload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load story.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => { isCancelled = true }
  }, [storyId])

  const handleToggleLike = async () => {
    if (!sessionUser || !story || isLiking) return
    if (story.author.id === sessionUser.id) return

    setIsLiking(true)

    try {
      const result = await toggleStoryLike(story.id)

      setStory((prev) =>
        prev
          ? { ...prev, hasLiked: result.data.liked, likesCount: result.data.likesCount }
          : prev
      )
    } catch {
      // silent
    } finally {
      setIsLiking(false)
    }
  }

  const handlePublishDraft = async () => {
    if (!story || story.publicationStatus !== 'DRAFT' || isPublishing) return

    setIsPublishing(true)
    setPublishError(null)

    try {
      await updateStory(story.id, { publicationStatus: 'PUBLISHED' })
      const payload = await getStory(story.id)
      setStory(payload.data)
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Could not publish.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async () => {
    if (!story || isDeleting) return

    const confirmed = window.confirm('Are you sure you want to delete this story? This cannot be undone.')

    if (!confirmed) return

    setIsDeleting(true)

    try {
      await deleteStory(story.id)
      router.push('/stories')
    } catch {
      setIsDeleting(false)
    }
  }

  const canEdit = sessionUser && story && (story.author.id === sessionUser.id || sessionUser.role === 'ADMIN')
  const isOwnStory = Boolean(sessionUser && story && story.author.id === sessionUser.id)
  const isDraft = Boolean(story?.publicationStatus === 'DRAFT')
  const isLiveForReaders = Boolean(
    story?.publicationStatus === 'PUBLISHED' && story?.moderationStatus === 'APPROVED'
  )
  const canPublishHere = Boolean(
    canEdit && isDraft && story && story.title.trim().length >= 3 && story.body.trim().length >= 10
  )

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.12),transparent_30%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

        <div className="relative z-10 mx-auto w-full max-w-[820px] pt-24">
          <Link
            href="/stories"
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/70"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Stories
          </Link>

          {isLoading ? (
            <p className="text-sm text-white/70">Loading story...</p>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className="rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          {!isLoading && story ? (
            <article>
              {!isDraft && story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'PENDING' ? (
                <div className="mb-5 rounded-lg border border-sky-500/35 bg-sky-500/10 px-4 py-3 text-sm text-sky-100/95">
                  <p className="font-semibold">In review</p>
                  <p className="mt-1 text-xs text-sky-100/75">
                    This story is waiting for a moderator. It is not visible on the public feed until it is approved.
                  </p>
                </div>
              ) : null}

              {!isDraft && story.moderationStatus === 'REJECTED' && story.moderationRejectReason ? (
                <div className="mb-5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100/95">
                  <p className="font-semibold">Not approved</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-rose-100/85">{story.moderationRejectReason}</p>
                  {isOwnStory ? (
                    <p className="mt-2 text-xs text-rose-100/65">
                      Edit your story and save changes to send it back for review.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {isDraft ? (
                <div className="mb-5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
                  <p className="font-semibold">Draft</p>
                  <p className="mt-1 text-xs text-amber-100/75">
                    This story is not visible to other people yet. Publish to submit it for review.
                  </p>
                  {publishError ? <p className="mt-2 text-xs text-rose-200">{publishError}</p> : null}
                  {canEdit ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handlePublishDraft()}
                        disabled={!canPublishHere || isPublishing}
                        className="rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-ember-100 transition hover:bg-[#3a1d13] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isPublishing ? 'Publishing...' : 'Publish now'}
                      </button>
                      {!canPublishHere ? (
                        <span className="text-[11px] text-amber-100/60">
                          Add a longer title (3+) and body (10+ characters) to publish.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold italic text-white md:text-4xl">
                {story.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
                <span>by {story.author.username}</span>
                <span>{formatFullDate(story.createdAt)}</span>
                {story.character ? (
                  <Link
                    href={`/characters/${story.character.slug}`}
                    className="flex items-center gap-1.5 transition hover:text-ember-300"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember-400/60" />
                    {story.character.name}
                  </Link>
                ) : null}
                {isDraft ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200/90">
                    Draft
                  </span>
                ) : null}
                {!isDraft && story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'PENDING' ? (
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200/90">
                    In review
                  </span>
                ) : null}
                {!isDraft && story.moderationStatus === 'REJECTED' ? (
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200/90">
                    Rejected
                  </span>
                ) : null}
              </div>

              <div className="mt-8 whitespace-pre-wrap text-sm leading-[1.85] text-white/75">
                {story.body}
              </div>

              <div className="mt-10 flex items-center gap-4 border-t border-white/10 pt-5">
                {sessionUser && !isOwnStory && isLiveForReaders ? (
                  <button
                    type="button"
                    onClick={handleToggleLike}
                    disabled={isLiking}
                    className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                      story.hasLiked
                        ? 'border-ember-500/50 bg-ember-500/15 text-ember-300'
                        : 'border-white/15 bg-white/5 text-white/60 hover:border-ember-500/40 hover:text-ember-200'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={story.hasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {story.likesCount}
                  </button>
                ) : sessionUser && isOwnStory ? (
                  <span
                    className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-white/35 opacity-80"
                    title="You can’t like your own story"
                    aria-label="Likes on your story (liking disabled)"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {story.likesCount}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-white/40">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {story.likesCount} likes
                  </span>
                )}

                {canEdit ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Link
                      href={`/stories/${story.id}/edit`}
                      className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/60 transition hover:border-white/25 hover:text-white/80"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3.5 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  )
}

export default StoryDetailPage
