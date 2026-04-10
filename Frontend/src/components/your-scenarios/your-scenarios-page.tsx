'use client'

import {
  buildScenarioEditHref,
  SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS,
  scenarioStatusLabel,
  scenarioStatusPillClass,
  scenarioTypeLabel
} from '@/components/your-characters/your-scenarios-helpers'
import AccountSideMenu from '@/components/shared/account-side-menu'
import MaintenanceWorkspaceGate from '@/components/shared/maintenance-workspace-gate'
import { useAuth } from '@/components/providers/auth-provider'
import { acknowledgeStoryRejections, listStories, type StoryListRecord } from '@/lib/story-api'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const ScenarioCharacterThumb = ({
  previewImageUrl,
  characterName,
  linked
}: {
  previewImageUrl: string | null
  characterName: string
  linked: boolean
}) => {
  return (
    <div className="relative h-[72px] w-[54px] shrink-0 overflow-hidden rounded-md border border-white/[0.12] bg-[#0d0d0d]">
      {linked && previewImageUrl ? (
        <Image
          src={previewImageUrl}
          alt={`${characterName} preview`}
          fill
          unoptimized
          className="object-cover object-top"
        />
      ) : null}
      {linked && !previewImageUrl ? (
        <div
          className="flex h-full w-full flex-col items-center justify-end gap-1 bg-[linear-gradient(180deg,#2a1f1c_0%,#120e0d_100%)] px-1 pb-2 pt-3"
          aria-hidden
        >
          <div className="h-7 w-7 rounded-full bg-white/15" />
          <div className="h-8 w-10 rounded-t-2xl rounded-b-md bg-white/10" />
        </div>
      ) : null}
      {!linked ? (
        <div className="flex h-full w-full items-center justify-center bg-white/[0.04] px-1 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-white/35">
          No character
        </div>
      ) : null}
    </div>
  )
}

const YourScenariosPage = () => {
  const { sessionUser, isAuthLoading, refreshSessionUser } = useAuth()
  const sessionUserId = sessionUser?.id
  const [stories, setStories] = useState<StoryListRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** One-shot per user session: acknowledging + refreshSessionUser must not re-run on every list refetch (stories dep). */
  const didAcknowledgeRejectionsRef = useRef(false)

  useEffect(() => {
    didAcknowledgeRejectionsRef.current = false
  }, [sessionUserId])

  useEffect(() => {
    if (isAuthLoading) {
      return
    }

    if (!sessionUserId) {
      setIsLoading(false)
      setStories([])
      return
    }

    let isCancelled = false

    void listStories({
      scope: 'mine',
      sort: 'newest',
      publication: 'all',
      limit: 60
    })
      .then((payload) => {
        if (!isCancelled) {
          setStories(payload.data)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setStories([])
          setLoadError(error instanceof Error ? error.message : 'Could not load scenarios.')
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [sessionUserId, isAuthLoading])

  useEffect(() => {
    if (!sessionUserId || isLoading || didAcknowledgeRejectionsRef.current) {
      return
    }

    const hasRejected = stories.some(
      (row) => row.publicationStatus === 'PUBLISHED' && row.moderationStatus === 'REJECTED'
    )

    if (!hasRejected) {
      return
    }

    didAcknowledgeRejectionsRef.current = true

    void acknowledgeStoryRejections()
      .then(() => {
        void refreshSessionUser()
      })
      .catch(() => {
        didAcknowledgeRejectionsRef.current = false
      })
  }, [sessionUserId, isLoading, stories, refreshSessionUser])

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            Your Scenarios
          </h1>
          <p className="mx-auto mt-3 max-w-[780px] text-center text-sm leading-7 text-white/70">
            Community scenarios you created — open to edit or check moderation status.
          </p>

          <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
            <AccountSideMenu activeKey="your-scenarios" />

            <MaintenanceWorkspaceGate>
              <div className="rounded-xl border border-white/10 bg-[#121010]/95 p-4 md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-[family-name:var(--font-heading)] text-[15px] font-semibold italic uppercase tracking-[0.12em] text-white/90">
                      My scenarios
                    </h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                      Drafts and published stories tied to your account.
                    </p>
                  </div>
                  <Link
                    href="/stories/create"
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
                    aria-label="Create new scenario"
                  >
                    New scenario
                  </Link>
                </div>

                {!sessionUser && !isAuthLoading ? (
                  <p className="mt-6 text-sm text-white/60">Sign in to see your scenarios.</p>
                ) : isLoading ? (
                  <p className="mt-6 text-sm text-white/75">Loading…</p>
                ) : loadError ? (
                  <p className="mt-6 text-sm text-rose-200/90">{loadError}</p>
                ) : stories.length === 0 ? (
                  <p className="mt-6 text-sm text-white/60">No scenarios yet.</p>
                ) : (
                  <ul className="mt-6 space-y-2">
                    {stories.map((story) => {
                      const typeLabel = scenarioTypeLabel(story)
                      const ch = story.character
                      const linked = Boolean(ch)
                      const thumbName = ch?.name?.trim() || 'Character'

                      return (
                        <li key={story.id}>
                          <Link
                            href={buildScenarioEditHref(story, {
                              returnTo: SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS
                            })}
                            className="flex gap-3 rounded-lg border border-white/[0.07] bg-[#0a0a0a]/90 px-3 py-2.5 transition hover:border-ember-500/35 hover:bg-[#141212]"
                          >
                            <ScenarioCharacterThumb
                              previewImageUrl={ch?.previewImageUrl ?? null}
                              characterName={thumbName}
                              linked={linked}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0 flex-1 font-[family-name:var(--font-heading)] text-[13px] font-medium italic leading-snug text-white/90 line-clamp-2">
                                  {story.title}
                                </span>
                                <span
                                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${scenarioStatusPillClass(story)}`}
                                >
                                  {scenarioStatusLabel(story)}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40">
                                {typeLabel ? <span>{typeLabel}</span> : null}
                                {ch ? (
                                  <span className="truncate">· {ch.name}</span>
                                ) : (
                                  <span>· No character linked</span>
                                )}
                              </div>
                              {story.moderationStatus === 'REJECTED' ? (
                                <div className="mt-2 rounded-md border border-rose-400/30 bg-rose-950/25 px-2.5 py-2">
                                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-rose-200/85">
                                    Rejection reason
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-white/85">
                                    {story.moderationRejectReason?.trim() ||
                                      'No reason was provided.'}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </MaintenanceWorkspaceGate>
          </div>
        </div>
      </section>
    </main>
  )
}

export default YourScenariosPage
