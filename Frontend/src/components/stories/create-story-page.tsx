'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { createStory } from '@/lib/story-api'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { buildAiGirlfriendRouteHref, buildAiGirlfriendRouteKey, extractAiGirlfriendIdFromRouteKey } from '@/lib/ai-girlfriend-route'
import { STORY_BODY_FIELD_TEXTAREA_CLASS, StoryBodyMarkupPreview } from '@/lib/story-body-markup-preview'
import { STORY_SCENARIO_TYPE_LABELS, STORY_SCENARIO_TYPES, type StoryScenarioType } from '@/lib/story-scenario-types'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

type CreateStoryPageProps = {
  /** From `/ai-girlfriends/[id]/write-scenario` — same as a `?characterId=` preset but no `/stories/*` route. */
  routeCharacterKey?: string | null
}

const CreateStoryPage = ({ routeCharacterKey = null }: CreateStoryPageProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetCharacterIdRaw = routeCharacterKey ?? searchParams.get('characterId')
  const presetCharacterId = presetCharacterIdRaw ? extractAiGirlfriendIdFromRouteKey(presetCharacterIdRaw) : null
  const { sessionUser, isAuthLoading } = useAuth()

  const [title, setTitle] = useState('')
  const [scenarioStory, setScenarioStory] = useState('')
  const [scenarioChat, setScenarioChat] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [scenarioType, setScenarioType] = useState<StoryScenarioType | ''>('')
  const [characters, setCharacters] = useState<CharacterListRecord[]>([])
  const [ownedCharactersLoaded, setOwnedCharactersLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthLoading) return
    if (!sessionUser) {
      router.replace('/?openSignIn=1')
      return
    }

    let isCancelled = false

    setOwnedCharactersLoaded(false)
    Promise.all([
      listCharacters({ galleryScope: 'all', sort: 'newest', limit: 200 }),
      listCharacters({ galleryScope: 'mine', sort: 'newest', limit: 200 })
    ])
      .then(([publicPayload, minePayload]) => {
        if (isCancelled) {
          return
        }
        const byCharacterId = new Map<string, CharacterListRecord>()
        for (const item of publicPayload.data) {
          byCharacterId.set(item.id, item)
        }
        for (const item of minePayload.data) {
          byCharacterId.set(item.id, item)
        }
        const mergedCharacters = [...byCharacterId.values()]
        setCharacters(mergedCharacters)

        if (presetCharacterId) {
          const presetMatch = mergedCharacters.find((c) => c.id === presetCharacterId || c.slug === presetCharacterId)
          if (!presetMatch) {
            setSelectedCharacterId('')
            setScenarioType('')
            setErrorMessage('This AI girlfriend is not available for story creation.')
            router.replace('/ai-girlfriends', { scroll: false })
          } else {
            setSelectedCharacterId(presetMatch.id)
            setErrorMessage(null)
          }
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setErrorMessage('Could not load your AI girlfriends. Refresh and try again.')
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setOwnedCharactersLoaded(true)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [isAuthLoading, sessionUser, router, presetCharacterId])

  const storyT = scenarioStory.trim()
  const chatT = scenarioChat.trim()
  const hasLinkedCharacter = selectedCharacterId.trim().length > 0
  const canSaveDraft =
    title.trim().length >= 1 &&
    (storyT.length >= 1 || chatT.length >= 1) &&
    !isSubmitting &&
    ownedCharactersLoaded &&
    hasLinkedCharacter
  const presetRequiresCharacterLink = Boolean(presetCharacterId)
  const mustLinkCharacterForPublish = true
  const canPublish =
    title.trim().length >= 3 &&
    storyT.length >= 30 &&
    chatT.length >= 10 &&
    storyT.length + chatT.length <= 20000 &&
    !isSubmitting &&
    Boolean(scenarioType) &&
    ownedCharactersLoaded &&
    hasLinkedCharacter &&
    (!presetRequiresCharacterLink || hasLinkedCharacter)

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const result = await createStory({
        title: title.trim(),
        scenarioStory,
        scenarioChat,
        characterId: selectedCharacterId,
        ...(scenarioType ? { scenarioType } : {}),
        publicationStatus: 'DRAFT'
      })

      const ref =
        result.data.character?.id ?? result.data.characterId ?? selectedCharacterId
      router.push(ref ? buildAiGirlfriendRouteHref(result.data.character?.name ?? 'ai-girlfriend', ref) : '/ai-girlfriends')
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
        scenarioStory,
        scenarioChat,
        characterId: selectedCharacterId,
        scenarioType: scenarioType as StoryScenarioType,
        publicationStatus: 'PUBLISHED'
      })

      const ref =
        result.data.character?.id ?? result.data.characterId ?? selectedCharacterId
      router.push(ref ? buildAiGirlfriendRouteHref(result.data.character?.name ?? 'ai-girlfriend', ref) : '/ai-girlfriends')
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

  if (presetCharacterId && !ownedCharactersLoaded) {
    return (
      <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
        <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">
          Loading your AI girlfriends…
        </div>
      </main>
    )
  }

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.10),transparent_28%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

        <div className="relative z-10 mx-auto min-w-0 w-full max-w-[960px] pt-24">
          <Link
            href={
              presetCharacterId
              ? `/ai-girlfriends/${encodeURIComponent(buildAiGirlfriendRouteKey('ai-girlfriend', presetCharacterId))}`
                : '/ai-girlfriends'
            }
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/70"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {presetCharacterId ? 'Back to AI girlfriend' : 'Back to AI Girlfriends'}
          </Link>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white md:text-5xl">
            New Story
          </h1>

          <form onSubmit={handlePublish} className="mt-8 min-w-0 space-y-5">
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
                Story category
              </label>
              <select
                value={scenarioType}
                onChange={(e) => setScenarioType(e.target.value as StoryScenarioType | '')}
                className="h-[48px] w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 pl-4 pr-14 text-sm text-white outline-none transition focus:border-ember-400/60"
                aria-label="Story category"
              >
                <option value="">Select category…</option>
                {STORY_SCENARIO_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {STORY_SCENARIO_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                Related AI girlfriend (required)
              </label>
              <select
                value={selectedCharacterId}
                onChange={(e) => setSelectedCharacterId(e.target.value)}
                className="h-[48px] w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 pl-4 pr-14 text-sm text-white outline-none transition focus:border-ember-400/60"
                aria-required={mustLinkCharacterForPublish}
              >
                <option value="">Select an AI girlfriend…</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {characters.length === 0 ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-rose-200/80">
                  No available AI girlfriends yet. Try opening a public profile page first.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                  Every story must be linked to an AI girlfriend to match the Phase-1 model.
                </p>
              )}
            </div>

            <div className="min-w-0 overflow-x-hidden rounded-md border border-white/10 bg-black/25 p-4 md:p-5">
              <div className="min-w-0 space-y-7">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-[22px] font-medium text-white/80">Scenario</label>
                    <p className="text-[18px] text-white/35">{scenarioStory.length} / 8000 tokens</p>
                  </div>
                  <textarea
                    value={scenarioStory}
                    onChange={(e) => setScenarioStory(e.target.value)}
                    maxLength={8000}
                    rows={6}
                    placeholder="Setting, situation, or roleplay context..."
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Scenario"
                  />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-[22px] font-medium text-white/80">Example dialogs (optional)</label>
                    <p className="text-[18px] text-white/35">{scenarioChat.length} / 12000 tokens</p>
                  </div>
                  <textarea
                    value={scenarioChat}
                    onChange={(e) => setScenarioChat(e.target.value)}
                    maxLength={12000}
                    rows={6}
                    placeholder="Sample exchanges (e.g. User: ... / Character: ...)"
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Example dialogs"
                  />
                </div>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-white/45">
                Text styling guide:{' '}
                <span className="text-white/65">&quot;quoted dialogue&quot;</span> uses your story-category color,{' '}
                <span className="text-white/65">**double-asterisk actions**</span> become gray italic narration, and{' '}
                <span className="text-white/65">*single-asterisk emphasis*</span> becomes pink italic text in chat preview.
              </p>

              {storyT.length > 0 || chatT.length > 0 ? (
                <div className="mt-5 min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Card preview</p>
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
                    <p className="min-w-0 whitespace-pre-line text-[12px] leading-relaxed text-white/75 [overflow-wrap:anywhere]">
                      {storyT || '…'}
                    </p>
                    <div className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#121010] p-3">
                      <p className="text-[8px] font-bold uppercase tracking-[0.11em] text-[#f59e0b]">Chat preview</p>
                      <div className="mt-2 min-w-0">
                        <StoryBodyMarkupPreview
                          key={scenarioType || 'none'}
                          text={chatT || '…'}
                          scenarioType={scenarioType || null}
                          className="text-[12px] leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
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
