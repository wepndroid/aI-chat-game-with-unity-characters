'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { createStory } from '@/lib/story-api'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const CreateStoryPage = () => {
  const router = useRouter()
  const { sessionUser, isAuthLoading } = useAuth()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [characters, setCharacters] = useState<CharacterListRecord[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthLoading) return
    if (!sessionUser) {
      router.replace('/?openSignIn=1')
      return
    }

    let isCancelled = false

    listCharacters({ galleryScope: 'mine', sort: 'newest', limit: 200 })
      .then((payload) => {
        if (!isCancelled) {
          setCharacters(payload.data)
        }
      })
      .catch(() => {})

    return () => { isCancelled = true }
  }, [isAuthLoading, sessionUser, router])

  const canSaveDraft = title.trim().length >= 1 && body.trim().length >= 1 && !isSubmitting
  const canPublish = title.trim().length >= 3 && body.trim().length >= 10 && !isSubmitting

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const result = await createStory({
        title: title.trim(),
        body: body.trim(),
        characterId: selectedCharacterId || undefined,
        publicationStatus: 'DRAFT'
      })

      router.push(`/stories/${result.data.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save draft.')
      setIsSubmitting(false)
    }
  }

  const handlePublish = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!canPublish) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const result = await createStory({
        title: title.trim(),
        body: body.trim(),
        characterId: selectedCharacterId || undefined,
        publicationStatus: 'PUBLISHED'
      })

      router.push(`/stories/${result.data.id}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not publish story.')
      setIsSubmitting(false)
    }
  }

  if (isAuthLoading || !sessionUser) {
    return (
      <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
        <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading...</div>
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
            href="/stories"
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/70"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Stories
          </Link>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white md:text-5xl">
            New Story
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Share your custom story adjustments, character scenarios, or roleplay ideas with the community.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/40">
            <span className="font-semibold text-white/55">Save draft</span> keeps your story private (only you see it)
            under <span className="text-white/50">My Stories → Drafts</span>.{' '}
            <span className="font-semibold text-white/55">Publish story</span> shares it on the public feed once title and
            body meet the minimum length.
          </p>

          <form onSubmit={handlePublish} className="mt-8 space-y-5">
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
                placeholder="Write your story, scenario, or character adjustment here..."
                className="w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 px-4 py-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/30 focus:border-ember-400/60"
              />
              <p className="mt-1 text-right text-[11px] text-white/30">{body.length}/20000</p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                Related character (optional)
              </label>
              <p className="mb-1.5 text-[11px] text-white/35">Only characters you own are listed.</p>
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={!canSaveDraft}
                className="flex flex-1 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:border-white/30 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? 'Saving...' : 'Save draft'}
              </button>
              <button
                type="submit"
                disabled={!canPublish}
                className="flex flex-1 items-center justify-center rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:border-ember-400/55 hover:bg-[#3a1d13] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ember-500/60 disabled:hover:bg-[#2b160f]/85"
              >
                {isSubmitting ? 'Publishing...' : 'Publish story'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}

export default CreateStoryPage
