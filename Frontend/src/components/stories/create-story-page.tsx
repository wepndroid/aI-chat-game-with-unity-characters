'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { createStory } from '@/lib/story-api'
import { listCharacters, uploadCharacterAssets, type CharacterListRecord } from '@/lib/character-api'
import { buildAiGirlfriendRouteHref, buildAiGirlfriendRouteKey, extractAiGirlfriendIdFromRouteKey } from '@/lib/ai-girlfriend-route'
import { STORY_BODY_FIELD_TEXTAREA_CLASS } from '@/lib/story-body-markup-preview'
import { lastPathSegmentFromUrl } from '@/lib/url-filename'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type CreateStoryPageProps = {
  routeCharacterKey?: string | null
}

const VOICE_FILE_MAX_BYTES = 30 * 1024 * 1024

const CreateStoryPage = ({ routeCharacterKey = null }: CreateStoryPageProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presetCharacterIdRaw = routeCharacterKey ?? searchParams.get('characterId')
  const presetCharacterId = presetCharacterIdRaw ? extractAiGirlfriendIdFromRouteKey(presetCharacterIdRaw) : null
  const { sessionUser, isAuthLoading } = useAuth()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [personality, setPersonality] = useState('')
  const [scenarioStory, setScenarioStory] = useState('')
  const [exampleDialogs, setExampleDialogs] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
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

    queueMicrotask(() => {
      if (!isCancelled) {
        setOwnedCharactersLoaded(false)
      }
    })

    Promise.all([
      listCharacters({ galleryScope: 'all', sort: 'newest', limit: 200 }),
      listCharacters({ galleryScope: 'mine', sort: 'newest', limit: 200 })
    ])
      .then(([publicPayload, minePayload]) => {
        if (isCancelled) return

        const byCharacterId = new Map<string, CharacterListRecord>()
        for (const item of publicPayload.data) byCharacterId.set(item.id, item)
        for (const item of minePayload.data) byCharacterId.set(item.id, item)

        const mergedCharacters = [...byCharacterId.values()]
        setCharacters(mergedCharacters)

        if (presetCharacterId) {
          const presetMatch = mergedCharacters.find((c) => c.id === presetCharacterId || c.slug === presetCharacterId)
          if (!presetMatch) {
            setSelectedCharacterId('')
            setErrorMessage('This AI girlfriend is not available for story creation.')
            router.replace('/ai-girlfriends', { scroll: false })
          } else {
            setSelectedCharacterId(presetMatch.id)
            setErrorMessage(null)
          }
        } else if (mergedCharacters.length === 1) {
          setSelectedCharacterId(mergedCharacters[0]!.id)
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

  const titleT = title.trim()
  const descriptionT = description.trim()
  const personalityT = personality.trim()
  const storyT = scenarioStory.trim()
  const chatT = exampleDialogs.trim()
  const firstMessageT = firstMessage.trim()
  const hasLinkedCharacter = selectedCharacterId.trim().length > 0

  const canSaveDraft =
    titleT.length >= 1 &&
    descriptionT.length >= 1 &&
    personalityT.length >= 1 &&
    storyT.length >= 1 &&
    firstMessageT.length >= 1 &&
    !isSubmitting &&
    ownedCharactersLoaded &&
    hasLinkedCharacter

  const presetRequiresCharacterLink = Boolean(presetCharacterId)
  const mustLinkCharacterForPublish = true

  const publishBlockingReasons = useMemo(() => {
    const reasons: string[] = []

    if (!ownedCharactersLoaded) {
      reasons.push('AI girlfriend options are still loading.')
    }

    if (!hasLinkedCharacter || (presetRequiresCharacterLink && !hasLinkedCharacter)) {
      reasons.push('Select an AI girlfriend.')
    }

    if (titleT.length < 3) {
      reasons.push(`Title needs at least ${3 - titleT.length} more character${3 - titleT.length === 1 ? '' : 's'}.`)
    }

    if (descriptionT.length < 1) {
      reasons.push('Description is required.')
    }

    if (personalityT.length < 1) {
      reasons.push('Personality is required.')
    }

    if (storyT.length < 30) {
      reasons.push(`Scenario needs at least ${30 - storyT.length} more character${30 - storyT.length === 1 ? '' : 's'}.`)
    }

    if (firstMessageT.length < 1) {
      reasons.push('First message is required.')
    }

    const combinedScenarioLength = storyT.length + chatT.length
    if (combinedScenarioLength > 20000) {
      reasons.push(`Scenario and example dialogs exceed the limit by ${combinedScenarioLength - 20000} characters.`)
    }

    return reasons
  }, [
    chatT.length,
    descriptionT.length,
    firstMessageT.length,
    hasLinkedCharacter,
    ownedCharactersLoaded,
    personalityT.length,
    presetRequiresCharacterLink,
    storyT.length,
    titleT.length
  ])

  const canPublish = publishBlockingReasons.length === 0 && !isSubmitting

  const submitStory = async (publicationStatus: 'DRAFT' | 'PUBLISHED') => {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      let voiceFileUrl: string | undefined
      let voiceFileName: string | undefined

      if (voiceFile) {
        if (!voiceFile.name.toLowerCase().endsWith('.wav')) {
          throw new Error('Voice upload must be a .wav file.')
        }

        if (voiceFile.size > VOICE_FILE_MAX_BYTES) {
          throw new Error('Voice WAV exceeds max size limit (30MB).')
        }

        const formData = new FormData()
        formData.append('voice', voiceFile)
        const uploadPayload = await uploadCharacterAssets(formData)
        voiceFileUrl = uploadPayload.data.voiceFileUrl
        voiceFileName = uploadPayload.data.voiceFileName ?? voiceFile.name

        if (!voiceFileUrl) {
          throw new Error('Voice upload did not return a WAV URL.')
        }
      }

      const result = await createStory({
        title: titleT,
        promptDescription: description,
        personality,
        scenario: scenarioStory,
        firstMessage,
        exampleDialogs,
        ...(voiceFileUrl ? { voiceFileUrl, voiceFileName: voiceFileName ?? lastPathSegmentFromUrl(voiceFileUrl) } : {}),
        scenarioStory,
        scenarioChat: exampleDialogs,
        characterId: selectedCharacterId,
        publicationStatus
      })

      const ref = result.data.character?.id ?? result.data.characterId ?? selectedCharacterId
      router.push(ref ? buildAiGirlfriendRouteHref(result.data.character?.name ?? 'ai-girlfriend', ref) : '/ai-girlfriends')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Could not ${publicationStatus === 'DRAFT' ? 'save draft' : 'publish story'}.`)
      setIsSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return
    await submitStory('DRAFT')
  }

  const handlePublish = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canPublish) return
    await submitStory('PUBLISHED')
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
        <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading your AI girlfriends...</div>
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
            href={presetCharacterId ? `/ai-girlfriends/${encodeURIComponent(buildAiGirlfriendRouteKey('ai-girlfriend', presetCharacterId))}` : '/ai-girlfriends'}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/70"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {presetCharacterId ? 'Back to AI girlfriend' : 'Back to AI Girlfriends'}
          </Link>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white md:text-5xl">New Story</h1>

          <form onSubmit={handlePublish} className="mt-8 min-w-0 space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Title</label>
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Related AI girlfriend (required)</label>
              <select
                value={selectedCharacterId}
                onChange={(e) => setSelectedCharacterId(e.target.value)}
                className="h-[48px] w-full rounded-lg border border-white/15 bg-[#0a0c10]/90 pl-4 pr-14 text-sm text-white outline-none transition focus:border-ember-400/60"
                aria-required={mustLinkCharacterForPublish}
              >
                <option value="">Select an AI girlfriend...</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {characters.length === 0 ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-rose-200/80">No available AI girlfriends yet. Try opening a public profile page first.</p>
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">Every story must be linked to an AI girlfriend to match the Phase-1 model.</p>
              )}
            </div>

            <div className="min-w-0 overflow-x-hidden rounded-md border border-white/10 bg-black/25 p-4 md:p-5">
              <div className="min-w-0 space-y-7">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-[22px] font-medium text-white/80">Description</label>
                    <p className="text-[18px] text-white/35">{description.length} / 5000 tokens</p>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={5000}
                    rows={5}
                    placeholder="Description..."
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Description"
                  />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-[22px] font-medium text-white/80">Personality</label>
                    <p className="text-[18px] text-white/35">{personality.length} / 8000 tokens</p>
                  </div>
                  <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    maxLength={8000}
                    rows={5}
                    placeholder="How the character thinks, speaks, and reacts..."
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Personality"
                  />
                </div>

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
                    <p className="text-[18px] text-white/35">{exampleDialogs.length} / 12000 tokens</p>
                  </div>
                  <textarea
                    value={exampleDialogs}
                    onChange={(e) => setExampleDialogs(e.target.value)}
                    maxLength={12000}
                    rows={6}
                    placeholder="Sample exchanges (e.g. User: ... / Character: ...)"
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Example dialogs"
                  />
                </div>

                <div className="min-w-0 rounded-md border border-white/10 bg-black/25 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">First message (required)</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/60">
                    Required plain text. Use <span className="text-white/75">*text*</span> for pink, <span className="text-white/75">&quot;text&quot;</span> for normal white, and <span className="text-white/75">**actions**</span> for actions.
                  </p>
                  <div className="mt-2 mb-2 flex items-center justify-between gap-3">
                    <label className="block text-sm font-semibold text-white/80">First message</label>
                    <p className="text-[18px] text-white/35">{firstMessage.length} / 50000 tokens</p>
                  </div>
                  <textarea
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    maxLength={50000}
                    rows={5}
                    placeholder='Use *like this* for pink, "like this" for normal white, and ** for actions.'
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="First message"
                  />
                </div>

                <div className="min-w-0 rounded-md border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Voice WAV</p>
                      <p className="mt-1 text-xs text-white/55">{voiceFile ? voiceFile.name : 'No story voice selected.'}</p>
                    </div>
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85 transition hover:border-white/35 hover:bg-white/10">
                      Choose WAV
                      <input
                        type="file"
                        accept=".wav,audio/wav,audio/x-wav"
                        className="sr-only"
                        disabled={isSubmitting}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          event.target.value = ''

                          if (!file) return

                          if (!file.name.toLowerCase().endsWith('.wav')) {
                            setErrorMessage('Voice upload must be a .wav file.')
                            return
                          }

                          if (file.size > VOICE_FILE_MAX_BYTES) {
                            setErrorMessage('Voice WAV exceeds max size limit (30MB).')
                            return
                          }

                          setVoiceFile(file)
                          setErrorMessage(null)
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {errorMessage ? (
              <p className="rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-xs font-semibold text-rose-200">{errorMessage}</p>
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

            {!canPublish ? (
              <div className="rounded-md border border-amber-400/25 bg-amber-500/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100/90">
                  Publish requirements
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-amber-100/80">
                  {publishBlockingReasons.map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-center text-[11px] leading-relaxed text-emerald-200/75">
                Publish is ready.
              </p>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}

export default CreateStoryPage
