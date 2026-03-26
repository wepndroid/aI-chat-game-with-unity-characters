'use client'

import { useAuth } from '@/components/providers/auth-provider'
import CharacterStatTile from '@/components/ui-elements/character-stat-tile'
import {
  getCharacterDetail,
  toggleCharacterHeart,
  type CharacterDetailRecord
} from '@/lib/character-api'
import {
  createCharacterReview,
  deleteCharacterReview,
  listCharacterReviews,
  updateCharacterReview,
  type CharacterReviewRecord
} from '@/lib/review-api'
import { apiGet } from '@/lib/api-client'
import { resolveAvailableTierCents, type PatreonStatusSnapshot } from '@/lib/patreon-access'
import {
  createVrmGLTFLoader,
  getVrmFromGltfUserData,
  loadVrmRuntime,
  optimizeVrmSceneForRendering,
  type VRM,
  type VrmLoadedGltf
} from '@/lib/vrm-three'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

type CharacterPageProps = {
  characterId?: string
}

const formatCompactNumber = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

const formatTierLabel = (tierCents: number | null) => {
  if (!tierCents || tierCents <= 0) {
    return 'Patreon tier required'
  }

  return `Requires EUR ${(tierCents / 100).toFixed(2)}+ tier`
}

const formatReviewDateLabel = (value: string) => {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(parsedDate)
}

const CharacterPreviewVisual = ({ previewImageUrl, characterName }: { previewImageUrl: string | null; characterName: string }) => {
  return (
    <div className="relative mx-auto flex h-[420px] w-[210px] items-end justify-center overflow-hidden rounded-sm border border-white/10 bg-[linear-gradient(to_bottom,#a7bbcb_0%,#546377_45%,#1d2530_100%)]">
      {previewImageUrl ? (
        <Image
          src={previewImageUrl}
          alt={`${characterName} preview`}
          fill
          unoptimized
          className="object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.4),transparent_35%)]" />
      {!previewImageUrl ? (
        <>
          <div className="absolute left-1/2 top-[78px] h-14 w-14 -translate-x-1/2 rounded-full bg-[#f8c5a5]" />
          <div className="absolute left-1/2 top-[130px] h-[170px] w-[92px] -translate-x-1/2 rounded-t-[40px] rounded-b-[16px] bg-white/90" />
          <div className="absolute left-1/2 top-[186px] h-[84px] w-[70px] -translate-x-1/2 rounded-t-[20px] bg-[#ff4f59]/70" />
          <div className="absolute bottom-0 left-1/2 h-[120px] w-[92px] -translate-x-1/2 bg-[linear-gradient(to_top,#2c3748,#1f2a3b)]" />
        </>
      ) : null}
    </div>
  )
}

const CharacterPage = ({ characterId }: CharacterPageProps) => {
  const { sessionUser } = useAuth()
  const [patreonStatusSnapshot, setPatreonStatusSnapshot] = useState<PatreonStatusSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(characterId))
  const [errorMessage, setErrorMessage] = useState<string | null>(characterId ? null : 'No character selected. Open one from the gallery.')
  const [characterRecord, setCharacterRecord] = useState<CharacterDetailRecord | null>(null)
  const [isThreePreviewOpen, setIsThreePreviewOpen] = useState(false)
  const [isThreePreviewLoading, setIsThreePreviewLoading] = useState(false)
  const [threePreviewLoadProgress, setThreePreviewLoadProgress] = useState<number | null>(null)
  const [threePreviewErrorMessage, setThreePreviewErrorMessage] = useState<string | null>(null)
  const [isThreePreviewExpanded, setIsThreePreviewExpanded] = useState(false)
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0)
  const [isHeartSubmitting, setIsHeartSubmitting] = useState(false)
  const [characterActionMessage, setCharacterActionMessage] = useState<string | null>(null)
  const [reviewList, setReviewList] = useState<CharacterReviewRecord[]>([])
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [reviewsErrorMessage, setReviewsErrorMessage] = useState<string | null>(null)
  const [reviewInputBody, setReviewInputBody] = useState('')
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [reviewActionMessage, setReviewActionMessage] = useState<string | null>(null)
  const threePreviewContainerReference = useRef<HTMLDivElement | null>(null)
  const [threePreviewContainerRevision, setThreePreviewContainerRevision] = useState(0)

  const previewContainerRef = useCallback((node: HTMLDivElement | null) => {
    threePreviewContainerReference.current = node
    setThreePreviewContainerRevision((previousRevision) => previousRevision + 1)
  }, [])

  useEffect(() => {
    if (!characterId) {
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      if (isCancelled) {
        return
      }

      setIsLoading(true)
      setErrorMessage(null)
      setCharacterActionMessage(null)

      try {
        const payload = await getCharacterDetail(characterId)

        if (isCancelled) {
          return
        }

        setCharacterRecord(payload.data)
        setIsThreePreviewOpen(false)
        setThreePreviewErrorMessage(null)
        setActiveScreenshotIndex(0)
      } catch (error) {
        if (isCancelled) {
          return
        }

        setCharacterRecord(null)
        setErrorMessage(error instanceof Error ? error.message : 'Character was not found.')
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [characterId])

  useEffect(() => {
    if (!characterId) {
      setCharacterRecord(null)
      setIsLoading(false)
      setErrorMessage('No character selected. Open one from the gallery.')
    }
  }, [characterId])

  useEffect(() => {
    if (!sessionUser?.id) {
      setPatreonStatusSnapshot(null)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      try {
        const payload = await apiGet<{ data: PatreonStatusSnapshot }>('/patreon/status')
        if (!isCancelled) {
          setPatreonStatusSnapshot(payload.data)
        }
      } catch {
        if (!isCancelled) {
          setPatreonStatusSnapshot(null)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [sessionUser?.id])

  const screenshotImageList = useMemo(() => {
    if (!characterRecord) {
      return []
    }

    const deduplicatedImageSet = new Set<string>()
    const imageList: string[] = []

    if (characterRecord.previewImageUrl) {
      deduplicatedImageSet.add(characterRecord.previewImageUrl)
      imageList.push(characterRecord.previewImageUrl)
    }

    for (const screenshot of characterRecord.screenshots) {
      const normalizedImageUrl = screenshot.imageUrl.trim()

      if (!normalizedImageUrl || deduplicatedImageSet.has(normalizedImageUrl)) {
        continue
      }

      deduplicatedImageSet.add(normalizedImageUrl)
      imageList.push(normalizedImageUrl)
    }

    return imageList
  }, [characterRecord])

  const activePreviewImageUrl = screenshotImageList[activeScreenshotIndex] ?? characterRecord?.previewImageUrl ?? null

  useEffect(() => {
    setActiveScreenshotIndex(0)
  }, [characterRecord?.id])

  const refreshReviewList = useCallback(async (selectedCharacterId: string) => {
    setIsReviewsLoading(true)
    setReviewsErrorMessage(null)

    try {
      const payload = await listCharacterReviews(selectedCharacterId)
      setReviewList(payload.data)
    } catch (error) {
      setReviewList([])
      setReviewsErrorMessage(error instanceof Error ? error.message : 'Failed to load reviews.')
    } finally {
      setIsReviewsLoading(false)
    }
  }, [])

  const selectedCharacterId = characterRecord?.id ?? null

  useEffect(() => {
    if (!selectedCharacterId) {
      return
    }

    refreshReviewList(selectedCharacterId).catch(() => {
      setReviewsErrorMessage('Failed to load reviews.')
      setIsReviewsLoading(false)
    })
  }, [refreshReviewList, selectedCharacterId])

  const ownReview = useMemo(() => {
    if (!sessionUser) {
      return null
    }

    return reviewList.find((review) => review.user.id === sessionUser.id) ?? null
  }, [reviewList, sessionUser])

  useEffect(() => {
    if (ownReview) {
      setReviewInputBody(ownReview.body)
      return
    }

    setReviewInputBody('')
  }, [ownReview])

  const subscriptionTierCents = useMemo(() => {
    if (!sessionUser || !patreonStatusSnapshot) {
      return 0
    }

    return resolveAvailableTierCents(patreonStatusSnapshot)
  }, [patreonStatusSnapshot, sessionUser])

  const canPostReviewWithSubscription =
    sessionUser?.role === 'ADMIN' || subscriptionTierCents > 0

  const canAccessGatedContent = characterRecord?.gatedAccess.hasAccess ?? false
  const isPatreonGated = characterRecord?.isPatreonGated ?? false
  const canUseCharacterActions = !isPatreonGated || canAccessGatedContent
  const canOpenThreePreview = canUseCharacterActions && Boolean(characterRecord?.vroidFileUrl)
  const descriptionText = characterRecord?.description ?? 'Character description is not available yet.'
  const firstMessagePreviewText = characterRecord?.firstMessage?.trim() ?? ''

  const characterStats = useMemo(() => {
    if (!characterRecord) {
      return []
    }

    return [
      { id: 'total-views', icon: 'x', value: formatCompactNumber(characterRecord.viewsCount), label: 'Total Views' },
      { id: 'likes', icon: 'o', value: formatCompactNumber(characterRecord.heartsCount), label: 'Likes' },
      { id: 'uploaded-by', icon: '*', value: characterRecord.owner.username, label: 'Uploaded By' }
    ]
  }, [characterRecord])

  const handleToggleHeart = async () => {
    if (!characterRecord) {
      return
    }

    if (!sessionUser) {
      setCharacterActionMessage('Please sign in before using hearts/favorites.')
      return
    }

    if (isHeartSubmitting) {
      return
    }

    setIsHeartSubmitting(true)
    setCharacterActionMessage(null)

    try {
      const payload = await toggleCharacterHeart(characterRecord.id)
      setCharacterRecord((previousCharacter) =>
        previousCharacter
          ? {
              ...previousCharacter,
              hasHearted: payload.data.hasHearted,
              heartsCount: payload.data.heartsCount
            }
          : previousCharacter
      )
    } catch (error) {
      setCharacterActionMessage(error instanceof Error ? error.message : 'Failed to toggle heart.')
    } finally {
      setIsHeartSubmitting(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!characterRecord) {
      return
    }

    if (!sessionUser) {
      setReviewActionMessage('Please sign in before posting a review.')
      return
    }

    const normalizedBody = reviewInputBody.trim()

    if (normalizedBody.length < 3) {
      setReviewActionMessage('Review text must be at least 3 characters.')
      return
    }

    if (isReviewSubmitting) {
      return
    }

    setIsReviewSubmitting(true)
    setReviewActionMessage(null)

    try {
      if (ownReview) {
        await updateCharacterReview(ownReview.id, {
          body: normalizedBody
        })
      } else {
        await createCharacterReview(characterRecord.id, {
          body: normalizedBody
        })
      }

      await refreshReviewList(characterRecord.id)
      setReviewActionMessage(ownReview ? 'Review updated.' : 'Review posted.')
    } catch (error) {
      setReviewActionMessage(error instanceof Error ? error.message : 'Failed to submit review.')
    } finally {
      setIsReviewSubmitting(false)
    }
  }

  const handleDeleteOwnReview = async () => {
    if (!characterRecord || !ownReview || isReviewSubmitting) {
      return
    }

    setIsReviewSubmitting(true)
    setReviewActionMessage(null)

    try {
      await deleteCharacterReview(ownReview.id)
      await refreshReviewList(characterRecord.id)
      setReviewInputBody('')
      setReviewActionMessage('Review removed.')
    } catch (error) {
      setReviewActionMessage(error instanceof Error ? error.message : 'Failed to delete review.')
    } finally {
      setIsReviewSubmitting(false)
    }
  }

  useLayoutEffect(() => {
    if (!isThreePreviewOpen || !canOpenThreePreview || !characterRecord?.vroidFileUrl) {
      return
    }

    let containerElement = threePreviewContainerReference.current

    if (!containerElement) {
      return
    }

    let isDisposed = false
    let frameRequestId = 0
    let resizeObserver: ResizeObserver | null = null
    let renderer: import('three').WebGLRenderer | null = null
    let vrmInstance: VRM | null = null
    let orbitControls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null = null

    const bootstrapPreview = async () => {
      setIsThreePreviewLoading(true)
      setThreePreviewLoadProgress(0)
      setThreePreviewErrorMessage(null)

      const loadTimeoutMs = 180000

      const formatLoadError = (error: unknown) => {
        const raw = error instanceof Error ? error.message : String(error)
        const lower = raw.toLowerCase()

        if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch') || lower.includes('load failed')) {
          return `${raw} — If the VRM is on another domain, that host must allow CORS. For this API’s /uploads, add your site origin to CORS_ORIGIN.`
        }

        return raw
      }

      try {
        const [{ Color, Scene, PerspectiveCamera, WebGLRenderer, DirectionalLight, AmbientLight, Clock }, vrmRuntime, { OrbitControls }] = await Promise.all([
          import('three'),
          loadVrmRuntime(),
          import('three/examples/jsm/controls/OrbitControls.js')
        ])

        if (isDisposed) {
          return
        }

        const scene = new Scene()
        scene.background = new Color('#120f14')

        const camera = new PerspectiveCamera(30, 1, 0.1, 1000)
        camera.position.set(0, 1.45, 2.2)

        const previewRenderer = new WebGLRenderer({
          antialias: true,
          alpha: true
        })
        renderer = previewRenderer
        previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        containerElement.innerHTML = ''
        const canvasElement = previewRenderer.domElement
        canvasElement.style.display = 'block'
        canvasElement.style.width = '100%'
        canvasElement.style.height = '100%'
        containerElement.appendChild(canvasElement)

        orbitControls = new OrbitControls(camera, canvasElement)
        orbitControls.target.set(0, 1, 0)
        orbitControls.enableDamping = true
        orbitControls.dampingFactor = 0.08
        orbitControls.minDistance = 0.6
        orbitControls.maxDistance = 6
        orbitControls.maxPolarAngle = Math.PI * 0.92

        const keyLight = new DirectionalLight('#ffffff', 1.2)
        keyLight.position.set(1, 1.5, 2)
        scene.add(keyLight)
        scene.add(new AmbientLight('#ffffff', 0.7))

        const resizePreview = () => {
          if (!renderer) {
            return
          }

          const width = Math.max(1, containerElement.clientWidth)
          const height = Math.max(1, containerElement.clientHeight)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height, false)
          orbitControls?.update()
        }

        resizePreview()
        resizeObserver = new ResizeObserver(() => resizePreview())
        resizeObserver.observe(containerElement)

        const loader = createVrmGLTFLoader(vrmRuntime)

        const vrmUrl = characterRecord.vroidFileUrl as string

        let loadTimeoutId: number | null = null

        const loadPromise = new Promise<VrmLoadedGltf>((resolve, reject) => {
          loader.load(
            vrmUrl,
            (gltf) => resolve(gltf as VrmLoadedGltf),
            (event) => {
              const progressEvent = event as ProgressEvent
              if (progressEvent.lengthComputable && progressEvent.total > 0) {
                setThreePreviewLoadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
              } else {
                setThreePreviewLoadProgress(null)
              }
            },
            (loadError) => reject(loadError)
          )
        })

        const timeoutPromise = new Promise<VrmLoadedGltf>((_resolve, reject) => {
          loadTimeoutId = window.setTimeout(() => {
            reject(
              new Error(
                `Timed out after ${Math.round(loadTimeoutMs / 1000)}s while downloading or parsing the VRM. Very large files are slow; try a smaller export or host the file closer to users.`
              )
            )
          }, loadTimeoutMs)
        })

        const loadedGltf = await Promise.race([loadPromise, timeoutPromise])

        if (loadTimeoutId !== null) {
          window.clearTimeout(loadTimeoutId)
        }

        if (isDisposed) {
          return
        }

        optimizeVrmSceneForRendering(vrmRuntime, loadedGltf.scene)
        vrmInstance = getVrmFromGltfUserData(loadedGltf)

        if (!vrmInstance) {
          throw new Error('No VRM model could be parsed from this file.')
        }

        vrmInstance.scene.rotation.y = Math.PI
        scene.add(vrmInstance.scene)

        const clock = new Clock()

        const runFrame = () => {
          if (isDisposed || !renderer || !vrmInstance) {
            return
          }

          const deltaTime = clock.getDelta()
          vrmInstance.update(deltaTime)
          orbitControls?.update()
          renderer.render(scene, camera)
          frameRequestId = window.requestAnimationFrame(runFrame)
        }

        runFrame()
      } catch (error) {
        if (!isDisposed) {
          setThreePreviewErrorMessage(formatLoadError(error))
        }
      } finally {
        if (!isDisposed) {
          setIsThreePreviewLoading(false)
          setThreePreviewLoadProgress(null)
        }
      }
    }

    bootstrapPreview().catch(() => {
      if (!isDisposed) {
        setIsThreePreviewLoading(false)
        setThreePreviewErrorMessage('Failed to load 3D preview.')
      }
    })

    return () => {
      isDisposed = true
      window.cancelAnimationFrame(frameRequestId)
      resizeObserver?.disconnect()
      orbitControls?.dispose()
      orbitControls = null
      renderer?.dispose()
      containerElement.innerHTML = ''
      vrmInstance = null
    }
  }, [canOpenThreePreview, characterRecord?.vroidFileUrl, isThreePreviewOpen, threePreviewContainerRevision])

  useEffect(() => {
    if (!isThreePreviewExpanded) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isThreePreviewExpanded])

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.12),transparent_35%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic text-white md:text-6xl">
            {characterRecord?.name ?? 'Character Detail'}
          </h1>
          {isLoading ? <p className="mt-4 text-center text-sm text-white/72">Loading character...</p> : null}
          {!isLoading && errorMessage ? (
            <div className="mx-auto mt-4 max-w-[760px] rounded-md border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-center text-sm text-rose-100">
              <p>{errorMessage}</p>
              <Link href="/characters" className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.08em] text-ember-200 hover:text-ember-100">
                Browse Characters
              </Link>
            </div>
          ) : null}

          {!isLoading && !errorMessage && characterRecord ? (
            <div className="mt-10 grid gap-5 lg:grid-cols-[1.28fr_1fr]">
              <div>
                <div className="relative rounded-md border border-white/10 bg-[linear-gradient(to_right,#3f2b1b,#1f1a1a_38%,#0e0f14)] px-5 py-5 md:px-7">
                  {canUseCharacterActions ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsThreePreviewOpen((previousState) => {
                          if (previousState) {
                            setIsThreePreviewExpanded(false)
                          }

                          return !previousState
                        })
                      }}
                      className="absolute right-4 top-4 inline-flex h-9 items-center justify-center rounded-md border border-white/35 bg-white/95 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1d1d1d]"
                      aria-label="Open 3D preview"
                      disabled={!canOpenThreePreview}
                    >
                      {canOpenThreePreview ? (isThreePreviewOpen ? 'Close 3D Preview' : '3D Preview') : '3D Unavailable'}
                    </button>
                  ) : (
                    <Link
                      href="/members"
                      className="absolute right-4 top-4 inline-flex h-9 items-center justify-center rounded-md border border-ember-300/40 bg-ember-300/15 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ember-100"
                      aria-label="Upgrade to unlock 3D preview"
                    >
                      Unlock Preview
                    </Link>
                  )}

                  {isThreePreviewOpen && canOpenThreePreview ? (
                    <div
                      className={
                        isThreePreviewExpanded
                          ? 'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/95 p-4'
                          : 'relative mx-auto h-[420px] w-[210px] overflow-hidden rounded-sm border border-white/10 bg-[#0f1117]'
                      }
                    >
                      {isThreePreviewExpanded ? (
                        <button
                          type="button"
                          onClick={() => setIsThreePreviewExpanded(false)}
                          className="absolute right-4 top-4 z-20 inline-flex h-9 items-center justify-center rounded-md border border-white/35 bg-white/95 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1d1d1d]"
                          aria-label="Exit full view"
                        >
                          Exit full view
                        </button>
                      ) : null}
                      {!isThreePreviewLoading && !threePreviewErrorMessage ? (
                        <button
                          type="button"
                          onClick={() => setIsThreePreviewExpanded((previousExpanded) => !previousExpanded)}
                          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-white/25 bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/90 backdrop-blur-sm hover:bg-black/70"
                          aria-label={isThreePreviewExpanded ? 'Smaller preview' : 'Full screen 3D preview'}
                        >
                          {isThreePreviewExpanded ? 'Smaller' : 'Full view'}
                        </button>
                      ) : null}
                      <div
                        ref={previewContainerRef}
                        className={
                          isThreePreviewExpanded
                            ? 'relative z-0 min-h-[280px] h-[min(85vh,900px)] w-full max-w-5xl'
                            : 'relative z-0 min-h-0 h-full w-full'
                        }
                      />
                      {isThreePreviewLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85">
                          Loading 3D preview
                          {threePreviewLoadProgress !== null ? `… ${threePreviewLoadProgress}%` : '…'}
                        </div>
                      ) : null}
                      {threePreviewErrorMessage ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-rose-200">
                          {threePreviewErrorMessage}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <CharacterPreviewVisual previewImageUrl={activePreviewImageUrl} characterName={characterRecord.name} />
                  )}
                  {canUseCharacterActions && !characterRecord.vroidFileUrl ? (
                    <p className="mt-2 text-center text-[10px] text-white/45">
                      3D preview needs a VRM on this character. Add a VRM URL or upload a file in Edit / Upload VRM, then refresh this page.
                    </p>
                  ) : null}
                </div>

                {screenshotImageList.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {screenshotImageList.map((imageUrl, index) => (
                      <button
                        key={imageUrl + index.toString()}
                        type="button"
                        onClick={() => {
                          setIsThreePreviewOpen(false)
                          setIsThreePreviewExpanded(false)
                          setActiveScreenshotIndex(index)
                        }}
                        className={`relative h-16 w-14 overflow-hidden rounded border ${
                          activeScreenshotIndex === index ? 'border-ember-300' : 'border-white/20'
                        }`}
                        aria-label={`Open screenshot ${index + 1}`}
                      >
                        <Image src={imageUrl} alt={`${characterRecord.name} screenshot ${index + 1}`} fill unoptimized className="object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {characterStats.map((statItem) => (
                    <CharacterStatTile key={statItem.id} icon={statItem.icon} value={statItem.value} label={statItem.label} />
                  ))}
                </div>

                <section className="mt-4 rounded-md border border-white/10 bg-[#121010] p-5">
                  <h3 className="font-[family-name:var(--font-heading)] text-[26px] font-semibold italic text-white">REVIEWS</h3>
                  {isReviewsLoading ? <p className="mt-3 text-xs text-white/70">Loading reviews...</p> : null}
                  {reviewsErrorMessage ? (
                    <p className="mt-3 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{reviewsErrorMessage}</p>
                  ) : null}

                  {!isReviewsLoading && !reviewsErrorMessage && reviewList.length === 0 ? (
                    <p className="mt-3 text-xs text-white/70">No reviews yet. Be the first to leave one.</p>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {reviewList.map((review) => (
                      <div key={review.id} className="rounded-sm border border-white/10 bg-[#0d0d0d] p-3">
                        <p className="text-[11px] font-semibold text-white/85">
                          {review.user.username}
                          <span className="ml-2 text-white/45">{formatReviewDateLabel(review.createdAt)}</span>
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-[1.45] text-white/65">{review.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-md border border-white/15 bg-black/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-white/65">
                      {ownReview ? 'Update your review' : 'Write a review'}
                    </p>
                    {!canPostReviewWithSubscription ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                        Written reviews require an active Patreon subscription linked to your account.{' '}
                        <Link href="/members" className="font-semibold text-ember-200 underline-offset-2 hover:text-ember-100">
                          Connect Patreon
                        </Link>
                      </p>
                    ) : null}
                    <textarea
                      value={reviewInputBody}
                      onChange={(event) => setReviewInputBody(event.target.value)}
                      placeholder="Write your review..."
                      disabled={!canPostReviewWithSubscription}
                      className="mt-2 h-24 w-full resize-none rounded border border-white/20 bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-ember-300 disabled:opacity-50"
                      aria-label="Review text"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitReview}
                        disabled={isReviewSubmitting || !canPostReviewWithSubscription}
                        className="rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-70"
                        aria-label={ownReview ? 'Update review' : 'Post review'}
                      >
                        {isReviewSubmitting ? 'Saving...' : ownReview ? 'Update Review' : 'Post Review'}
                      </button>
                      {ownReview ? (
                        <button
                          type="button"
                          onClick={handleDeleteOwnReview}
                          disabled={isReviewSubmitting || !canPostReviewWithSubscription}
                          className="rounded-md border border-rose-300/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-rose-200 disabled:opacity-70"
                          aria-label="Delete your review"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    {reviewActionMessage ? (
                      <p className="mt-2 text-xs text-white/75">{reviewActionMessage}</p>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="rounded-md border border-white/10 bg-[#1a1414] p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-heading)] text-[42px] font-semibold italic leading-none text-white">
                      {characterRecord.name}
                    </h2>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-white/50">
                      {characterRecord.tagline ?? 'VRoid Character'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleHeart}
                    disabled={isHeartSubmitting}
                    className={`inline-flex size-8 items-center justify-center rounded-full border text-xs transition ${
                      characterRecord.hasHearted
                        ? 'border-rose-300/70 bg-rose-300/20 text-rose-200'
                        : 'border-white/30 text-white/60 hover:border-rose-300/45 hover:text-rose-200'
                    }`}
                    aria-label="Add to favorites"
                  >
                    {'\u2665'}
                  </button>
                </div>
                {characterActionMessage ? <p className="mt-3 text-xs text-white/70">{characterActionMessage}</p> : null}
                {isPatreonGated ? (
                  <p className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                    {canAccessGatedContent ? 'Patreon content unlocked' : `Locked | ${formatTierLabel(characterRecord.gatedAccess.requiredTierCents)}`}
                  </p>
                ) : null}

                <div className="mt-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-amber-300">Description</p>
                  <p className="mt-3 text-[11px] leading-[1.5] text-white/70">{descriptionText}</p>
                </div>

                <div className="mt-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-amber-300">First Message Preview</p>
                  <div className="mt-3 rounded-md border border-amber-300/25 bg-[#161111] p-3">
                    {firstMessagePreviewText.length > 0 ? (
                      <p className="whitespace-pre-wrap text-[11px] leading-[1.5] text-white/75">{firstMessagePreviewText}</p>
                    ) : (
                      <p className="text-[11px] leading-[1.5] text-white/55">No first-message preview has been added yet.</p>
                    )}
                  </div>
                </div>

                {canUseCharacterActions && characterRecord.vroidFileUrl ? (
                  <a
                    href={characterRecord.vroidFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border border-white/20 bg-white/5 px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition hover:border-ember-300 hover:text-ember-200"
                    aria-label="Download VRM file"
                  >
                    Download VRM
                  </a>
                ) : null}
                {isPatreonGated && !canAccessGatedContent ? (
                  <Link
                    href="/members"
                    className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[30px] font-semibold italic leading-none text-white transition hover:brightness-110"
                    aria-label="Connect Patreon and upgrade tier"
                  >
                    Unlock with Patreon
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[30px] font-semibold italic leading-none text-white transition hover:brightness-110"
                    aria-label="Start chat"
                  >
                    Start Chat
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

export default CharacterPage
