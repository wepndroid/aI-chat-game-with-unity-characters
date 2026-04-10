'use client'

import { useAuth } from '@/components/providers/auth-provider'
import {
  getStory,
  updateStory,
  type StoryModerationStatus,
  type StoryPublicationStatus
} from '@/lib/story-api'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { STORY_BODY_FIELD_TEXTAREA_CLASS, StoryBodyMarkupPreview } from '@/lib/story-body-markup-preview'
import { SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS } from '@/components/your-characters/your-scenarios-helpers'
import { STORY_SCENARIO_TYPE_LABELS, STORY_SCENARIO_TYPES, type StoryScenarioType } from '@/lib/story-scenario-types'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type EditStoryPageProps = {
  storyId: string
  /** Segment from `/characters/[id]/edit-scenario/...` (id or slug). */
  characterRouteKey?: string | null
}

const EditStoryPage = ({ storyId, characterRouteKey = null }: EditStoryPageProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnToPath =
    searchParams.get('returnTo') === SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS ? '/your-scenarios' : null
  const { sessionUser, isAuthLoading } = useAuth()

  const [title, setTitle] = useState('')
  const [scenarioStory, setScenarioStory] = useState('')
  const [scenarioChat, setScenarioChat] = useState('')
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [scenarioType, setScenarioType] = useState<StoryScenarioType | ''>('')
  const [characters, setCharacters] = useState<CharacterListRecord[]>([])
  const [publicationStatus, setPublicationStatus] = useState<StoryPublicationStatus>('PUBLISHED')
  const [storyModerationStatus, setStoryModerationStatus] = useState<StoryModerationStatus | null>(null)
  const [storyRejectReason, setStoryRejectReason] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoadingStory, setIsLoadingStory] = useState(true)
  /** Snapshot after load — resubmit for review only when current fields differ. */
  const [contentBaseline, setContentBaseline] = useState<{
    title: string
    scenarioStory: string
    scenarioChat: string
    characterId: string
    scenarioType: string
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

        setTitle(story.title)
        const hasSplit =
          (story.scenarioStory && story.scenarioStory.trim().length > 0) ||
          (story.scenarioChat && story.scenarioChat.trim().length > 0)
        if (hasSplit) {
          setScenarioStory(story.scenarioStory ?? '')
          setScenarioChat(story.scenarioChat ?? '')
        } else {
          setScenarioStory(story.body ?? '')
          setScenarioChat('')
        }
        setSelectedCharacterId(story.characterId ?? '')
        setScenarioType(
          story.scenarioType && story.scenarioType in STORY_SCENARIO_TYPE_LABELS
            ? (story.scenarioType as StoryScenarioType)
            : ''
        )
        setPublicationStatus(story.publicationStatus)
        setStoryModerationStatus(story.moderationStatus)
        setStoryRejectReason(story.moderationRejectReason)

        const initialTitle = story.title.trim()
        const initialScenarioStory = hasSplit ? (story.scenarioStory ?? '').trim() : (story.body ?? '').trim()
        const initialScenarioChat = hasSplit ? (story.scenarioChat ?? '').trim() : ''
        setContentBaseline({
          title: initialTitle,
          scenarioStory: initialScenarioStory,
          scenarioChat: initialScenarioChat,
          characterId: story.characterId ?? '',
          scenarioType:
            story.scenarioType && story.scenarioType in STORY_SCENARIO_TYPE_LABELS ? (story.scenarioType as StoryScenarioType) : ''
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
  const st = scenarioStory.trim()
  const ch = scenarioChat.trim()
  const storyBodyFields = {
    title: t,
    scenarioStory: st,
    scenarioChat: ch,
    characterId: selectedCharacterId || null,
    scenarioType: scenarioType || null
  }
  const hasContentChanged = useMemo(() => {
    if (!contentBaseline) {
      return false
    }
    return (
      t !== contentBaseline.title ||
      st !== contentBaseline.scenarioStory ||
      ch !== contentBaseline.scenarioChat ||
      (selectedCharacterId || '') !== contentBaseline.characterId ||
      (scenarioType || '') !== contentBaseline.scenarioType
    )
  }, [contentBaseline, t, st, ch, selectedCharacterId, scenarioType])

  /** Live / pending / rejected published edits must change something before resubmitting for review. */
  const mustChangeBeforeReviewSubmit =
    publicationStatus === 'PUBLISHED' &&
    storyModerationStatus !== null &&
    ['APPROVED', 'REJECTED', 'PENDING'].includes(storyModerationStatus)

  const mustLinkCharacterWhenPublished = characters.length > 0
  const canSavePublished =
    publicationStatus === 'PUBLISHED' &&
    t.length >= 3 &&
    st.length >= 30 &&
    ch.length >= 10 &&
    st.length + ch.length <= 20000 &&
    !isSubmitting &&
    !loadError &&
    Boolean(scenarioType) &&
    (!mustLinkCharacterWhenPublished || Boolean(selectedCharacterId.trim())) &&
    (!mustChangeBeforeReviewSubmit || hasContentChanged)
  const canSaveDraftEdit =
    publicationStatus === 'DRAFT' &&
    t.length >= 1 &&
    (st.length >= 1 || ch.length >= 1) &&
    !isSubmitting &&
    !loadError
  const canPublishFromDraft =
    publicationStatus === 'DRAFT' &&
    t.length >= 3 &&
    st.length >= 30 &&
    ch.length >= 10 &&
    st.length + ch.length <= 20000 &&
    !isSubmitting &&
    !loadError &&
    Boolean(scenarioType) &&
    (!mustLinkCharacterWhenPublished || Boolean(selectedCharacterId.trim()))

  const characterPagePath = useCallback(() => {
    const fromList = characters.find((c) => c.id === selectedCharacterId)
    const seg = fromList
      ? fromList.slug || fromList.id
      : selectedCharacterId || characterRouteKey || null

    return seg ? `/characters/${encodeURIComponent(seg)}` : '/characters'
  }, [characters, selectedCharacterId, characterRouteKey])

  const resolveExitPath = useCallback(() => {
    return returnToPath ?? characterPagePath()
  }, [returnToPath, characterPagePath])

  const handleSaveDraftOnly = async () => {
    if (!canSaveDraftEdit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await updateStory(storyId, { ...storyBodyFields })

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
      await updateStory(storyId, { ...storyBodyFields })

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
            {returnToPath ? 'Back to your scenarios' : 'Back to character'}
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
            {returnToPath ? 'Back to your scenarios' : 'Back to character'}
          </Link>

          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white md:text-5xl">
            Edit Story
          </h1>

          {publicationStatus === 'PUBLISHED' && storyModerationStatus === 'REJECTED' ? (
            <div className="mt-6 rounded-lg border border-rose-400/35 bg-rose-950/30 px-4 py-3 md:px-5 md:py-4">
              <p className="font-[family-name:var(--font-heading)] text-base font-semibold italic text-rose-100/95 md:text-lg">
                This scenario was rejected
              </p>
              {storyRejectReason?.trim() ? (
                <div className="mt-2 rounded-md border border-white/10 bg-black/30 px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/45">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{storyRejectReason.trim()}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/55">No rejection reason was recorded.</p>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                Edit the scenario below, then save — <span className="font-semibold text-ember-200/95">Submit for review</span>{' '}
                is available only after you change the title, category, character link, or scenario text.
              </p>
            </div>
          ) : null}

          {publicationStatus === 'PUBLISHED' && storyModerationStatus === 'APPROVED' ? (
            <div className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-950/20 px-4 py-3 md:px-5 md:py-4">
              <p className="font-[family-name:var(--font-heading)] text-base font-semibold italic text-emerald-100/95 md:text-lg">
                This scenario is live
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                If you change the title, category, character link, or scenario text and save, the scenario is{' '}
                <span className="font-semibold text-ember-200/95">sent for moderation again</span> and stays hidden from the
                public listing until an admin approves it.
              </p>
            </div>
          ) : null}

          {publicationStatus === 'PUBLISHED' && storyModerationStatus === 'PENDING' ? (
            <div className="mt-6 rounded-lg border border-amber-400/35 bg-amber-950/20 px-4 py-3 md:px-5 md:py-4">
              <p className="font-[family-name:var(--font-heading)] text-base font-semibold italic text-amber-100/95 md:text-lg">
                Awaiting moderation
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                You can update the scenario below; <span className="font-semibold text-ember-200/95">Save</span> is enabled
                only when something changes.
              </p>
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
                Related character (optional)
              </label>
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

            <div className="min-w-0 overflow-x-hidden rounded-md border border-white/10 bg-black/25 p-4 md:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Scenario content</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                <span className="text-white/55">Story</span> = setting (plain).{' '}
                <span className="text-white/55">Chat &amp; explanation</span> = dialogue (
                <span className="text-white/55">&quot;quotes&quot;</span>
                ), <span className="text-white/55">**beats**</span>, <span className="text-white/55">*pink*</span>.
              </p>
              <div className="mt-4 grid min-w-0 gap-5 md:grid-cols-2 md:items-start">
                <div className="min-w-0">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                    Story (setting)
                  </label>
                  <textarea
                    value={scenarioStory}
                    onChange={(e) => setScenarioStory(e.target.value)}
                    maxLength={12000}
                    rows={12}
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Story setting"
                  />
                  <p className="mt-1 text-right text-[11px] text-white/30">{scenarioStory.length}/12000</p>
                </div>
                <div className="min-w-0">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                    Chat &amp; explanation
                  </label>
                  <textarea
                    value={scenarioChat}
                    onChange={(e) => setScenarioChat(e.target.value)}
                    maxLength={12000}
                    rows={12}
                    className={STORY_BODY_FIELD_TEXTAREA_CLASS}
                    aria-label="Chat and explanation"
                  />
                  <p className="mt-1 text-right text-[11px] text-white/30">{scenarioChat.length}/12000</p>
                </div>
              </div>
              {st.length > 0 || ch.length > 0 ? (
                <div className="mt-5 min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Card preview</p>
                  <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
                    <p className="min-w-0 whitespace-pre-line text-[12px] leading-relaxed text-white/75 [overflow-wrap:anywhere]">
                      {st || '…'}
                    </p>
                    <div className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#121010] p-3">
                      <p className="text-[8px] font-bold uppercase tracking-[0.11em] text-[#f59e0b]">Chat preview</p>
                      <div className="mt-2 min-w-0">
                        <StoryBodyMarkupPreview
                          key={scenarioType || 'none'}
                          text={ch || '…'}
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
                    : storyModerationStatus === 'REJECTED'
                      ? 'Save & submit for review'
                      : storyModerationStatus === 'APPROVED' || storyModerationStatus === 'PENDING'
                        ? 'Submit for review'
                        : 'Save changes'}
                </button>
                {mustChangeBeforeReviewSubmit && !hasContentChanged ? (
                  <p className="text-center text-[11px] leading-relaxed text-white/40">
                    Change the scenario above to enable submit.
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
