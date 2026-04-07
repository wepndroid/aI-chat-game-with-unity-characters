'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { getStory, updateStory, type StoryPublicationStatus } from '@/lib/story-api'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type EditStoryPageProps = {
  storyId: string
}

const EditStoryPage = ({ storyId }: EditStoryPageProps) => {
  const router = useRouter()
  const { sessionUser, isAuthLoading } = useAuth()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [characters, setCharacters] = useState<CharacterListRecord[]>([])
  const [publicationStatus, setPublicationStatus] = useState<StoryPublicationStatus>('PUBLISHED')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoadingStory, setIsLoadingStory] = useState(true)

  useEffect(() => {
    if (isAuthLoading) return
    if (!sessionUser) {
      router.replace('/?openSignIn=1')
      return
    }

    let isCancelled = false

    void (async () => {
      try {
        const payload = await getStory(storyId)
        if (isCancelled) return

        const story = payload.data
        const canEdit = story.author.id === sessionUser.id || sessionUser.role === 'ADMIN'

        if (!canEdit) {
          setLoadError('You can only edit your own stories.')
          setIsLoadingStory(false)
          return
        }

        setTitle(story.title)
        setBody(story.body)
        setSelectedCharacterId(story.characterId ?? '')
        setPublicationStatus(story.publicationStatus)

        const isAdminEditingOther =
          sessionUser.role === 'ADMIN' && story.author.id !== sessionUser.id

        try {
          const charPayload = await listCharacters(
            isAdminEditingOther
              ? { ownerId: story.author.id, sort: 'newest', limit: 200 }
              : { galleryScope: 'mine', sort: 'newest', limit: 200 }
          )
          if (!isCancelled) {
            setCharacters(charPayload.data)
          }
        } catch {
          if (!isCancelled) {
            setCharacters([])
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load story.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingStory(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [isAuthLoading, sessionUser, router, storyId])

  const t = title.trim()
  const b = body.trim()
  const canSavePublished =
    publicationStatus === 'PUBLISHED' && t.length >= 3 && b.length >= 10 && !isSubmitting && !loadError
  const canSaveDraftEdit =
    publicationStatus === 'DRAFT' && t.length >= 1 && b.length >= 1 && !isSubmitting && !loadError
  const canPublishFromDraft =
    publicationStatus === 'DRAFT' && t.length >= 3 && b.length >= 10 && !isSubmitting && !loadError

  const handleSaveDraftOnly = async () => {
    if (!canSaveDraftEdit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateStory(storyId, {
        title: t,
        body: b,
        characterId: selectedCharacterId || null
      })

      router.push(`/stories/${storyId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save story.'
      setErrorMessage(message)
      setIsSubmitting(false)
    }
  }

  const handlePublishFromDraft = async () => {
    if (!canPublishFromDraft) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateStory(storyId, {
        title: t,
        body: b,
        characterId: selectedCharacterId || null,
        publicationStatus: 'PUBLISHED'
      })

      router.push(`/stories/${storyId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not publish story.'
      setErrorMessage(message)
      setIsSubmitting(false)
    }
  }

  const handleSavePublished = async () => {
    if (!canSavePublished) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateStory(storyId, {
        title: t,
        body: b,
        characterId: selectedCharacterId || null
      })

      router.push(`/stories/${storyId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save story.'
      setErrorMessage(message)
      setIsSubmitting(false)
    }
  }

  if (isAuthLoading || !sessionUser || isLoadingStory) {
    return (
      <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
        <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading...</div>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
        <div className="mx-auto max-w-[720px] px-5 pt-24">
          <p className="rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{loadError}</p>
          <Link href={`/stories/${storyId}`} className="mt-4 inline-block text-sm text-ember-300 hover:underline">
            Back to story
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.10),transparent_28%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

        <div className="relative z-10 mx-auto w-full max-w-[720px] pt-24">
          <Link
            href={`/stories/${storyId}`}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/70"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to story
          </Link>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white md:text-5xl">
            Edit Story
          </h1>
          {publicationStatus === 'DRAFT' ? (
            <p className="mt-2 text-sm text-amber-200/80">
              This story is a draft — only you can see it until you publish.
            </p>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (publicationStatus === 'PUBLISHED') {
                void handleSavePublished()
              }
            }}
            className="mt-8 space-y-5"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Give your story a title..."
                className="h-[48px] w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-ember-400/60"
              />
              <p className="mt-1 text-right text-[11px] text-white/30">{title.length}/200</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                Story body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={20000}
                rows={14}
                placeholder="Write your story..."
                className="w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 px-4 py-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/30 focus:border-ember-400/60"
              />
              <p className="mt-1 text-right text-[11px] text-white/30">{body.length}/20000</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                Related character (optional)
              </label>
              <p className="mb-1.5 text-[11px] text-white/35">
                Only characters owned by the story author are listed.
              </p>
              <select
                value={selectedCharacterId}
                onChange={(e) => setSelectedCharacterId(e.target.value)}
                className="h-[48px] w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 pl-4 pr-14 text-sm text-white outline-none transition focus:border-ember-400/60"
              >
                <option value="">None</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {errorMessage ? (
              <p className="rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-xs font-semibold text-rose-200">
                {errorMessage}
              </p>
            ) : null}

            {publicationStatus === 'DRAFT' ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <button
                  type="button"
                  onClick={() => void handleSaveDraftOnly()}
                  disabled={!canSaveDraftEdit}
                  className="flex flex-1 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:border-white/30 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? 'Saving...' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePublishFromDraft()}
                  disabled={!canPublishFromDraft}
                  className="flex flex-1 items-center justify-center rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:border-ember-400/55 hover:bg-[#3a1d13] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ember-500/60 disabled:hover:bg-[#2b160f]/85"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish story'}
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!canSavePublished}
                className="flex w-full items-center justify-center rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:border-ember-400/55 hover:bg-[#3a1d13] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ember-500/60 disabled:hover:bg-[#2b160f]/85"
              >
                {isSubmitting ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}

export default EditStoryPage
