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

const formatReviewRelativeLabel = (value: string) => {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'recent'
  }

  const elapsedMs = Date.now() - parsedDate.getTime()
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)))

  if (elapsedDays <= 0) {
    return 'today'
  }

  if (elapsedDays === 1) {
    return '1d ago'
  }

  if (elapsedDays < 30) {
    return `${elapsedDays}d ago`
  }

  const elapsedMonths = Math.floor(elapsedDays / 30)
  return `${elapsedMonths}mo ago`
}

const StartChatIcon = ({ className = 'size-8' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.75c-4.97 0-9 3.32-9 7.43 0 2.61 1.65 4.9 4.14 6.22-.09 1.11-.4 2.26-1.12 3.03a.6.6 0 0 0 .58 1.01c1.92-.35 3.49-1.2 4.45-1.86.31.03.62.05.95.05 4.97 0 9-3.32 9-7.43S16.97 2.75 12 2.75Z"
        fill="currentColor"
      />
      <circle cx="8.5" cy="10.3" r="1.05" fill="#f48f49" />
      <circle cx="12" cy="10.3" r="1.05" fill="#f48f49" />
      <circle cx="15.5" cy="10.3" r="1.05" fill="#f48f49" />
    </svg>
  )
}

const ChatStatIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.75c-4.97 0-9 3.32-9 7.43 0 2.61 1.65 4.9 4.14 6.22-.09 1.11-.4 2.26-1.12 3.03a.6.6 0 0 0 .58 1.01c1.92-.35 3.49-1.2 4.45-1.86.31.03.62.05.95.05 4.97 0 9-3.32 9-7.43S16.97 2.75 12 2.75Z"
        fill="#f19147"
      />
      <circle cx="8.5" cy="10.3" r="1.05" fill="#1f120d" />
      <circle cx="12" cy="10.3" r="1.05" fill="#1f120d" />
      <circle cx="15.5" cy="10.3" r="1.05" fill="#1f120d" />
    </svg>
  )
}

const HeartStatIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.03 6.03 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z"
        fill="#f75de8"
      />
    </svg>
  )
}

const UploadedByStatIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="6" width="14" height="14" rx="0.9" fill="#6d7380" />
      <rect x="9" y="2" width="6" height="4.3" rx="0.55" fill="#6d7380" />
      <circle cx="12" cy="4.15" r="0.95" fill="#17181c" />
      <circle cx="12" cy="13.05" r="2.15" fill="#17181c" />
      <path d="M8.6 19.2c.58-2.02 1.95-3.2 3.4-3.2s2.82 1.18 3.4 3.2v.8H8.6v-.8Z" fill="#17181c" />
    </svg>
  )
}

const DescriptionHeartIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path
        d="m12 20.2-.78-.7C6.46 15.21 3.5 12.53 3.5 9.23 3.5 6.55 5.6 4.5 8.25 4.5c1.5 0 2.95.7 3.75 1.82A4.83 4.83 0 0 1 15.75 4.5c2.66 0 4.75 2.05 4.75 4.73 0 3.3-2.96 5.98-7.72 10.27l-.78.7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const CharacterPreviewVisual = ({ previewImageUrl, characterName }: { previewImageUrl: string | null; characterName: string }) => {
  return (
    <div className="relative mx-auto flex h-[430px] w-[225px] items-end justify-center overflow-hidden rounded-sm border border-white/10 bg-black">
      {previewImageUrl ? (
        <Image
          src={previewImageUrl}
          alt={`${characterName} preview`}
          fill
          unoptimized
          className="object-contain object-bottom"
        />
      ) : null}
      {!previewImageUrl ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.35),transparent_35%),radial-gradient(circle_at_12%_75%,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_88%_30%,rgba(255,255,255,0.2),transparent_24%)]" />
      ) : null}
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
  const [isHeartSubmitting, setIsHeartSubmitting] = useState(false)
  const [heartToast, setHeartToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null)
  const heartToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const showHeartToast = useCallback((message: string, variant: 'success' | 'error') => {
    if (heartToastTimeoutRef.current) {
      clearTimeout(heartToastTimeoutRef.current)
      heartToastTimeoutRef.current = null
    }

    setHeartToast({ message, variant })
    heartToastTimeoutRef.current = setTimeout(() => {
      setHeartToast(null)
      heartToastTimeoutRef.current = null
    }, 4000)
  }, [])

  useEffect(() => {
    return () => {
      if (heartToastTimeoutRef.current) {
        clearTimeout(heartToastTimeoutRef.current)
      }
    }
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
      if (heartToastTimeoutRef.current) {
        clearTimeout(heartToastTimeoutRef.current)
        heartToastTimeoutRef.current = null
      }
      setHeartToast(null)

      try {
        const payload = await getCharacterDetail(characterId)

        if (isCancelled) {
          return
        }

        setCharacterRecord(payload.data)
        setIsThreePreviewOpen(false)
        setThreePreviewErrorMessage(null)
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
      {
        id: 'total-chats',
        icon: <ChatStatIcon className="size-[24px]" />,
        value: formatCompactNumber(characterRecord.viewsCount),
        label: 'Total Chats'
      },
      {
        id: 'likes',
        icon: <HeartStatIcon className="size-[24px]" />,
        value: formatCompactNumber(characterRecord.heartsCount),
        label: 'Likes'
      },
      {
        id: 'uploaded-by',
        icon: <UploadedByStatIcon className="size-[24px]" />,
        value: characterRecord.owner.username,
        label: 'Uploaded By'
      }
    ]
  }, [characterRecord])

  const handleToggleHeart = async () => {
    if (!characterRecord) {
      return
    }

    if (!sessionUser) {
      showHeartToast('Please sign in before using hearts/favorites.', 'error')
      return
    }

    if (isHeartSubmitting) {
      return
    }

    setIsHeartSubmitting(true)

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
      showHeartToast(
        payload.data.hasHearted ? 'Added to your favorites.' : 'Removed from your favorites.',
        'success'
      )
    } catch (error) {
      showHeartToast(error instanceof Error ? error.message : 'Failed to update favorites.', 'error')
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

  const playDemoHref = useMemo(() => {
    if (!characterRecord) {
      return '/play-demo'
    }

    return `/play-demo?characterId=${encodeURIComponent(characterRecord.id)}&character=${encodeURIComponent(characterRecord.slug)}`
  }, [characterRecord])

  useLayoutEffect(() => {
    if (!isThreePreviewOpen || !canOpenThreePreview || !characterRecord?.vroidFileUrl) {
      return
    }

    const containerElement = threePreviewContainerReference.current

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
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic text-white md:text-[62px]">
            AI Girlfriend
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
            <div className="mt-10 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <div className="relative overflow-hidden rounded-md border border-white/10 bg-[linear-gradient(90deg,#5d3b24_0%,#201817_38%,#0b1430_100%)] px-5 py-5 md:px-7">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,243,200,0.5),transparent_34%),radial-gradient(circle_at_26%_58%,rgba(255,255,255,0.16),transparent_26%),radial-gradient(circle_at_74%_58%,rgba(255,255,255,0.1),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0)_58%,rgba(0,0,0,0.86)_100%)]" />
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
                      className="absolute right-4 top-4 z-[2] inline-flex h-9 items-center justify-center rounded-md border border-white/40 bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1d1d1d]"
                      aria-label="Open 3D preview"
                      disabled={!canOpenThreePreview}
                    >
                      {canOpenThreePreview ? (isThreePreviewOpen ? 'Close 3D Preview' : '3D Preview') : '3D Unavailable'}
                    </button>
                  ) : (
                    <Link
                      href="/members"
                      className="absolute right-4 top-4 z-[2] inline-flex h-9 items-center justify-center rounded-md border border-ember-300/40 bg-ember-300/15 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ember-100"
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
                          : 'relative mx-auto h-[430px] w-[225px] overflow-hidden rounded-sm border border-white/10 bg-[#0f1117]'
                      }
                    >
                      {!isThreePreviewLoading && !threePreviewErrorMessage ? (
                        <button
                          type="button"
                          onClick={() => setIsThreePreviewExpanded((previousExpanded) => !previousExpanded)}
                          className={`absolute left-1/2 z-[190] -translate-x-1/2 rounded-md border border-white/25 bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/90 backdrop-blur-sm hover:bg-black/70 ${
                            isThreePreviewExpanded ? 'top-[5.25rem]' : 'top-3'
                          }`}
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
                      {isThreePreviewExpanded ? (
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-[200] flex items-start justify-start gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
                          <button
                            type="button"
                            onClick={() => setIsThreePreviewExpanded(false)}
                            className="pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full border border-white/40 bg-black/80 text-white shadow-lg backdrop-blur-sm transition hover:border-ember-300/60 hover:bg-black/90 hover:text-white"
                            aria-label="Exit full view"
                            title="Exit full view"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-5"
                              aria-hidden="true"
                            >
                              <path d="m15 18-6-6 6-6" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="relative z-[1]">
                      <CharacterPreviewVisual
                        previewImageUrl={characterRecord.previewImageUrl}
                        characterName={characterRecord.name}
                      />
                    </div>
                  )}
                  {canUseCharacterActions && !characterRecord.vroidFileUrl ? (
                    <p className="mt-2 text-center text-[10px] text-white/45">
                      3D preview needs a VRM on this character. Add a VRM URL or upload a file in Edit / Upload VRM, then refresh this page.
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {characterStats.map((statItem) => (
                    <CharacterStatTile key={statItem.id} icon={statItem.icon} value={statItem.value} label={statItem.label} />
                  ))}
                </div>

                <section className="mt-4 rounded-md border border-white/10 bg-[#121010] p-5">
                  <h3 className="font-[family-name:var(--font-heading)] text-[26px] font-semibold italic uppercase text-white">Comments</h3>
                  {isReviewsLoading ? <p className="mt-3 text-xs text-white/70">Loading reviews...</p> : null}
                  {reviewsErrorMessage ? (
                    <p className="mt-3 rounded-md border border-white/10 bg-[#0e0b0b] px-3 py-2 text-xs text-white/60">
                      Comments are unavailable until this character is public.
                    </p>
                  ) : null}

                  {!isReviewsLoading && !reviewsErrorMessage && reviewList.length === 0 ? (
                    <p className="mt-3 text-xs text-white/70">No comments yet. Be the first to leave one.</p>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {reviewList.map((review) => (
                      <div key={review.id} className="rounded-sm border border-white/10 bg-[#0d0d0d] p-3">
                        <p className="text-[11px] font-semibold text-white/85">
                          {review.user.username}
                          <span className="ml-2 text-white/45">{formatReviewRelativeLabel(review.createdAt)}</span>
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-[11px] leading-[1.45] text-white/65">{review.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-md border border-white/15 bg-black/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-white/65">
                      {ownReview ? 'Update your comment' : 'Write a comment'}
                    </p>
                    {!canPostReviewWithSubscription ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                        Written comments require an active Patreon subscription linked to your account.{' '}
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
                        aria-label={ownReview ? 'Update comment' : 'Post comment'}
                      >
                        {isReviewSubmitting ? 'Saving...' : ownReview ? 'Update Comment' : 'Post Comment'}
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

              <div className="rounded-md border border-white/10 bg-[#1a1213] p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-heading)] text-[48px] font-semibold italic uppercase leading-none text-white">
                      {characterRecord.name}
                    </h2>
                    <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.09em] text-white/45">
                      {(characterRecord.tagline ?? 'VRoid Character').toUpperCase()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleHeart}
                    disabled={isHeartSubmitting}
                    className={`inline-flex size-8 items-center justify-center rounded-full border text-xs transition ${
                      characterRecord.hasHearted
                        ? 'border-[#8f6447] bg-[#2e221c] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]'
                        : 'border-[#775844] bg-[#261c17] text-white/95 hover:border-[#8f6447] hover:bg-[#2c201a]'
                    }`}
                    aria-label="Add to favorites"
                  >
                    <DescriptionHeartIcon className="size-[13px]" />
                  </button>
                </div>
                {isPatreonGated ? (
                  <p className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-100">
                    {canAccessGatedContent ? 'Patreon content unlocked' : `Locked | ${formatTierLabel(characterRecord.gatedAccess.requiredTierCents)}`}
                  </p>
                ) : null}

                <div className="mt-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-amber-300">Description</p>
                  <p className="mt-3 whitespace-pre-line text-[11px] leading-[1.75] text-white/75">{descriptionText}</p>
                </div>

                <div className="mt-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-amber-300">First Message Preview</p>
                  <div className="mt-3 rounded-md border border-amber-300/25 bg-[#171111] p-3">
                    {firstMessagePreviewText.length > 0 ? (
                      <p className="whitespace-pre-wrap text-[11px] italic leading-[1.7] text-white/75">{firstMessagePreviewText}</p>
                    ) : (
                      <p className="text-[11px] leading-[1.5] text-white/55">No first-message preview has been added yet.</p>
                    )}
                  </div>
                </div>

                {isPatreonGated && !canAccessGatedContent ? (
                  <Link
                    href="/members"
                    className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[40px] font-semibold italic leading-none text-white transition hover:brightness-110"
                    aria-label="Connect Patreon and upgrade tier"
                  >
                    Unlock with Patreon
                  </Link>
                ) : (
                  <Link
                    href={playDemoHref}
                    className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 font-[family-name:var(--font-heading)] text-[calc(40px*2/3)] font-semibold italic uppercase leading-none text-white transition hover:brightness-110"
                    aria-label="Start chat in the WebGL demo with this character"
                  >
                    Start Chat
                    <span className="text-white/95">
                      <StartChatIcon className="size-8" />
                    </span>
                  </Link>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {heartToast ? (
        <div
          className={`fixed bottom-6 right-6 z-[200] max-w-[min(calc(100vw-2rem),22rem)] rounded-lg border px-4 py-3 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.45)] ${
            heartToast.variant === 'error'
              ? 'border-rose-300/35 bg-[#1c1012] text-rose-100'
              : 'border-emerald-300/35 bg-[#0f1614] text-emerald-100'
          }`}
          role={heartToast.variant === 'error' ? 'alert' : 'status'}
          aria-live={heartToast.variant === 'error' ? 'assertive' : 'polite'}
        >
          {heartToast.message}
        </div>
      ) : null}
    </main>
  )
}

export default CharacterPage
