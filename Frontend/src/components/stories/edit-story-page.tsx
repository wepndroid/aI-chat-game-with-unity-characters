'use client'

import { useAuth } from '@/components/providers/auth-provider'
import {
  getStory,
  updateStory,
  type StoryModerationStatus,
  type StoryPublicationStatus
} from '@/lib/story-api'
import { listCharacters, uploadCharacterAssets, type CharacterListRecord } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey, extractAiGirlfriendIdFromRouteKey } from '@/lib/ai-girlfriend-route'
import { STORY_BODY_FIELD_TEXTAREA_CLASS } from '@/lib/story-body-markup-preview'
import { SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS } from '@/components/your-characters/your-scenarios-helpers'
import { lastPathSegmentFromUrl } from '@/lib/url-filename'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type EditStoryPageProps = {
  storyId: string
  characterRouteKey?: string | null
}

const VOICE_FILE_MAX_BYTES = 30 * 1024 * 1024

const EditStoryPage = ({ storyId, characterRouteKey = null }: EditStoryPageProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnToPath =
    searchParams.get('returnTo') === SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS ? '/your-scenarios' : null
  const { sessionUser, isAuthLoading } = useAuth()
  const isAdminEditor = sessionUser?.role === 'ADMIN'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [personality, setPersonality] = useState('')
  const [scenarioStory, setScenarioStory] = useState('')
  const [exampleDialogs, setExampleDialogs] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [voiceFileUrl, setVoiceFileUrl] = useState('')
  const [voiceFileName, setVoiceFileName] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [characters, setCharacters] = useState<CharacterListRecord[]>([])
  const [linkedCharacterName, setLinkedCharacterName] = useState('')
  const [publicationStatus, setPublicationStatus] = useState<StoryPublicationStatus>('PUBLISHED')
  const [storyModerationStatus, setStoryModerationStatus] = useState<StoryModerationStatus | null>(null)
  const [storyRejectReason, setStoryRejectReason] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoadingStory, setIsLoadingStory] = useState(true)
  const [contentBaseline, setContentBaseline] = useState<{
    title: string
    description: string
    personality: string
    scenarioStory: string
    exampleDialogs: string
    firstMessage: string
    characterId: string
    voiceFileUrl: string
    voiceFileName: string
  } | null>(null)

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

        setTitle(story.title ?? '')
        setDescription(story.promptDescription ?? '')
        setPersonality(story.personality ?? '')
        setScenarioStory((story.scenarioStory ?? story.body ?? '').trim())
        setExampleDialogs(story.scenarioChat ?? story.exampleDialogs ?? '')
        setFirstMessage(story.firstMessage ?? '')
        setVoiceFile(null)
        setVoiceFileUrl(story.voiceFileUrl ?? '')
        setVoiceFileName(story.voiceFileName ?? '')
        const initialCharacterId = story.characterId ?? story.character?.id ?? ''
        setSelectedCharacterId(initialCharacterId)
        setLinkedCharacterName(story.character?.name ?? '')
        setPublicationStatus(story.publicationStatus)
        setStoryModerationStatus(story.moderationStatus)
        setStoryRejectReason(story.moderationRejectReason)

        setContentBaseline({
          title: (story.title ?? '').trim(),
          description: (story.promptDescription ?? '').trim(),
          personality: (story.personality ?? '').trim(),
          scenarioStory: (story.scenarioStory ?? story.body ?? '').trim(),
          exampleDialogs: (story.scenarioChat ?? story.exampleDialogs ?? '').trim(),
          firstMessage: (story.firstMessage ?? '').trim(),
          characterId: initialCharacterId,
          voiceFileUrl: story.voiceFileUrl ?? '',
          voiceFileName: story.voiceFileName ?? ''
        })

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
          setContentBaseline(null)
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
  const desc = description.trim()
  const persona = personality.trim()
  const st = scenarioStory.trim()
  const ch = exampleDialogs.trim()
  const first = firstMessage.trim()

  const storyBodyFields = {
    title: t,
    promptDescription: description,
    personality,
    scenario: scenarioStory,
    firstMessage,
    exampleDialogs,
    scenarioStory: st,
    scenarioChat: ch,
    voiceFileUrl: voiceFileUrl.trim() || undefined,
    voiceFileName: voiceFileName.trim() || undefined
  }

  const hasContentChanged = useMemo(() => {
    if (!contentBaseline) {
      return false
    }
    return (
      t !== contentBaseline.title ||
      desc !== contentBaseline.description ||
      persona !== contentBaseline.personality ||
      st !== contentBaseline.scenarioStory ||
      ch !== contentBaseline.exampleDialogs ||
      first !== contentBaseline.firstMessage ||
      voiceFileUrl.trim() !== contentBaseline.voiceFileUrl ||
      voiceFileName.trim() !== contentBaseline.voiceFileName ||
      Boolean(voiceFile)
    )
  }, [contentBaseline, t, desc, persona, st, ch, first, voiceFile, voiceFileName, voiceFileUrl])

  const mustChangeBeforeReviewSubmit =
    publicationStatus === 'PUBLISHED' &&
    storyModerationStatus !== null &&
    ['APPROVED', 'REJECTED', 'PENDING'].includes(storyModerationStatus)

  const canSavePublished =
    publicationStatus === 'PUBLISHED' &&
    t.length >= 3 &&
    desc.length >= 1 &&
    persona.length >= 1 &&
    st.length >= 30 &&
    first.length >= 1 &&
    st.length + ch.length <= 20000 &&
    !isSubmitting &&
    !loadError &&
    (!mustChangeBeforeReviewSubmit || hasContentChanged)

  const canSaveDraftEdit =
    publicationStatus === 'DRAFT' &&
    t.length >= 1 &&
    desc.length >= 1 &&
    persona.length >= 1 &&
    st.length >= 1 &&
    first.length >= 1 &&
    !isSubmitting &&
    !loadError

  const canPublishFromDraft =
    publicationStatus === 'DRAFT' &&
    t.length >= 3 &&
    desc.length >= 1 &&
    persona.length >= 1 &&
    st.length >= 30 &&
    first.length >= 1 &&
    st.length + ch.length <= 20000 &&
    !isSubmitting &&
    !loadError

  const characterPagePath = useCallback(() => {
    const fromList = characters.find((c) => c.id === selectedCharacterId)
    const seg = fromList
      ? buildAiGirlfriendRouteKey(fromList.name, fromList.id)
      : selectedCharacterId
        ? buildAiGirlfriendRouteKey('ai-girlfriend', selectedCharacterId)
        : characterRouteKey
          ? buildAiGirlfriendRouteKey('ai-girlfriend', extractAiGirlfriendIdFromRouteKey(characterRouteKey))
          : null

    return seg ? `/ai-girlfriends/${encodeURIComponent(seg)}` : '/ai-girlfriends'
  }, [characters, selectedCharacterId, characterRouteKey])

  const resolveExitPath = useCallback(() => {
    if (isAdminEditor) {
      return '/admin/stories'
    }
    return returnToPath ?? characterPagePath()
  }, [isAdminEditor, returnToPath, characterPagePath])

  const uploadPendingVoiceFile = async () => {
    if (!voiceFile) {
      return {
        voiceFileUrl: voiceFileUrl.trim() || undefined,
        voiceFileName: voiceFileName.trim() || undefined
      }
    }

    if (!voiceFile.name.toLowerCase().endsWith('.wav')) {
      throw new Error('Voice upload must be a .wav file.')
    }

    if (voiceFile.size > VOICE_FILE_MAX_BYTES) {
      throw new Error('Voice WAV exceeds max size limit (30MB).')
    }

    const formData = new FormData()
    formData.append('voice', voiceFile)
    const uploadPayload = await uploadCharacterAssets(formData)
    const nextVoiceUrl = uploadPayload.data.voiceFileUrl

    if (!nextVoiceUrl) {
      throw new Error('Voice upload did not return a WAV URL.')
    }

    return {
      voiceFileUrl: nextVoiceUrl,
      voiceFileName: uploadPayload.data.voiceFileName ?? voiceFile.name ?? lastPathSegmentFromUrl(nextVoiceUrl)
    }
  }

  const handleSaveDraftOnly = async () => {
    if (!canSaveDraftEdit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateStory(storyId, { ...storyBodyFields, ...(await uploadPendingVoiceFile()) })
      router.push(resolveExitPath())
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
        ...storyBodyFields,
        ...(await uploadPendingVoiceFile()),
        publicationStatus: 'PUBLISHED'
      })

      router.push(resolveExitPath())
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
      await updateStory(storyId, { ...storyBodyFields, ...(await uploadPendingVoiceFile()) })
      router.push(resolveExitPath())
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
          <Link href={resolveExitPath()} className="mt-4 inline-block text-sm text-ember-300 hover:underline">
            {returnToPath ? 'Back to your scenarios' : 'Back to AI girlfriend'}
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

        <div className="relative z-10 mx-auto min-w-0 w-full max-w-[960px] pt-24">
          <Link
            href={resolveExitPath()}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/45 transition hover:text-white/70"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {returnToPath ? 'Back to your scenarios' : 'Back to AI girlfriend'}
          </Link>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white md:text-5xl">Edit Story</h1>

          {publicationStatus === 'PUBLISHED' && storyModerationStatus === 'REJECTED' ? (
            <div className="mt-6 rounded-lg border border-rose-400/35 bg-rose-950/30 px-4 py-3 md:px-5 md:py-4">
              <p className="font-[family-name:var(--font-heading)] text-base font-semibold italic text-rose-100/95 md:text-lg">This scenario was rejected</p>
              {storyRejectReason?.trim() ? (
                <div className="mt-2 rounded-md border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/45">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{storyRejectReason.trim()}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/55">No rejection reason was recorded.</p>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                Edit the scenario below, then save. Submit for review is available only after you change the title or story content.
              </p>
            </div>
          ) : null}

          {publicationStatus === 'PUBLISHED' && storyModerationStatus === 'APPROVED' ? (
            <div className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-950/20 px-4 py-3 md:px-5 md:py-4">
              <p className="font-[family-name:var(--font-heading)] text-base font-semibold italic text-emerald-100/95 md:text-lg">This scenario is live</p>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                If you change the title or story content and save, the scenario is sent for moderation again and stays hidden from the public listing until an admin approves it.
              </p>
            </div>
          ) : null}

          {publicationStatus === 'PUBLISHED' && storyModerationStatus === 'PENDING' ? (
            <div className="mt-6 rounded-lg border border-amber-400/35 bg-amber-950/20 px-4 py-3 md:px-5 md:py-4">
              <p className="font-[family-name:var(--font-heading)] text-base font-semibold italic text-amber-100/95 md:text-lg">Awaiting moderation</p>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">You can update the scenario below; Save is enabled only when something changes.</p>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (publicationStatus === 'PUBLISHED') {
                void handleSavePublished()
              }
            }}
            className="mt-8 min-w-0 space-y-5"
          >
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Related AI girlfriend</label>
              <div className="flex min-h-[48px] w-full items-center rounded-lg border border-white/15 bg-[#0a0c10]/90 px-4 text-sm text-white/75">
                {linkedCharacterName || (selectedCharacterId ? 'Linked AI girlfriend' : 'No linked AI girlfriend')}
              </div>
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
                      <p className="mt-1 text-xs text-white/55">
                        {voiceFile
                          ? voiceFile.name
                          : voiceFileName.trim()
                            ? voiceFileName.trim()
                            : voiceFileUrl.trim()
                              ? lastPathSegmentFromUrl(voiceFileUrl)
                              : 'No story voice selected.'}
                      </p>
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
                          setVoiceFileName(file.name)
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
              <div className="space-y-2">
                <button
                  type="submit"
                  disabled={!canSavePublished}
                  className="flex w-full items-center justify-center rounded-lg border border-ember-500/60 bg-[#2b160f]/85 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-ember-100 transition hover:border-ember-400/55 hover:bg-[#3a1d13] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ember-500/60 disabled:hover:bg-[#2b160f]/85"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : isAdminEditor
                      ? 'Save changes'
                      : storyModerationStatus === 'REJECTED'
                        ? 'Save & submit for review'
                        : storyModerationStatus === 'APPROVED' || storyModerationStatus === 'PENDING'
                          ? 'Submit for review'
                          : 'Save changes'}
                </button>
                {mustChangeBeforeReviewSubmit && !hasContentChanged ? (
                  <p className="text-center text-[11px] leading-relaxed text-white/40">
                    {isAdminEditor ? 'Change the scenario above to enable save.' : 'Change the scenario above to enable submit.'}
                  </p>
                ) : null}
              </div>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}

export default EditStoryPage
