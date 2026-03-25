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
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

const renderReviewStars = (rating: number) => {
  const normalizedRating = Math.max(1, Math.min(5, Math.round(rating)))
  return `\u2605`.repeat(normalizedRating) + `\u2606`.repeat(5 - normalizedRating)
}

type VrmLike = {
  scene: import('three').Object3D
  update: (deltaTime: number) => void
}

type LoadedGltfLike = {
  scene: import('three').Object3D
  userData: {
    vrm?: VrmLike
  }
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
  const [isLoading, setIsLoading] = useState(Boolean(characterId))
  const [errorMessage, setErrorMessage] = useState<string | null>(characterId ? null : 'No character selected. Open one from the gallery.')
  const [characterRecord, setCharacterRecord] = useState<CharacterDetailRecord | null>(null)
  const [isThreePreviewOpen, setIsThreePreviewOpen] = useState(false)
  const [isThreePreviewLoading, setIsThreePreviewLoading] = useState(false)
  const [threePreviewErrorMessage, setThreePreviewErrorMessage] = useState<string | null>(null)
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0)
  const [isHeartSubmitting, setIsHeartSubmitting] = useState(false)
  const [characterActionMessage, setCharacterActionMessage] = useState<string | null>(null)
  const [reviewList, setReviewList] = useState<CharacterReviewRecord[]>([])
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [reviewsErrorMessage, setReviewsErrorMessage] = useState<string | null>(null)
  const [reviewInputRating, setReviewInputRating] = useState(5)
  const [reviewInputBody, setReviewInputBody] = useState('')
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false)
  const [reviewActionMessage, setReviewActionMessage] = useState<string | null>(null)
  const threePreviewContainerReference = useRef<HTMLDivElement | null>(null)

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
      setReviewInputRating(ownReview.rating)
      setReviewInputBody(ownReview.body)
      return
    }

    setReviewInputRating(5)
    setReviewInputBody('')
  }, [ownReview])

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
        const payload = await updateCharacterReview(ownReview.id, {
          rating: reviewInputRating,
          body: normalizedBody
        })

        setCharacterRecord((previousCharacter) =>
          previousCharacter
            ? {
                ...previousCharacter,
                averageRating: payload.data.averageRating
              }
            : previousCharacter
        )
      } else {
        const payload = await createCharacterReview(characterRecord.id, {
          rating: reviewInputRating,
          body: normalizedBody
        })

        setCharacterRecord((previousCharacter) =>
          previousCharacter
            ? {
                ...previousCharacter,
                averageRating: payload.data.averageRating
              }
            : previousCharacter
        )
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
      const payload = await deleteCharacterReview(ownReview.id)
      setCharacterRecord((previousCharacter) =>
        previousCharacter
          ? {
              ...previousCharacter,
              averageRating: payload.data.averageRating
            }
          : previousCharacter
      )
      await refreshReviewList(characterRecord.id)
      setReviewInputRating(5)
      setReviewInputBody('')
      setReviewActionMessage('Review removed.')
    } catch (error) {
      setReviewActionMessage(error instanceof Error ? error.message : 'Failed to delete review.')
    } finally {
      setIsReviewSubmitting(false)
    }
  }

  useEffect(() => {
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
    let vrmInstance: VrmLike | null = null

    const bootstrapPreview = async () => {
      setIsThreePreviewLoading(true)
      setThreePreviewErrorMessage(null)

      try {
        const [{ Color, Scene, PerspectiveCamera, WebGLRenderer, DirectionalLight, AmbientLight, Clock }, { GLTFLoader }, { VRMUtils, VRMLoaderPlugin }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('@pixiv/three-vrm')
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
        containerElement.appendChild(previewRenderer.domElement)

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
        }

        resizePreview()
        resizeObserver = new ResizeObserver(() => resizePreview())
        resizeObserver.observe(containerElement)

        const loader = new GLTFLoader()
        loader.crossOrigin = 'anonymous'
        loader.register((parser) => new VRMLoaderPlugin(parser))

        const loadedGltf = await new Promise<LoadedGltfLike>((resolve, reject) => {
          loader.load(
            characterRecord.vroidFileUrl as string,
            (gltf) => resolve(gltf as LoadedGltfLike),
            undefined,
            (loadError) => reject(loadError)
          )
        })

        if (isDisposed) {
          return
        }

        VRMUtils.removeUnnecessaryVertices(loadedGltf.scene)
        VRMUtils.removeUnnecessaryJoints(loadedGltf.scene)
        vrmInstance = loadedGltf.userData.vrm ?? null

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
          renderer.render(scene, camera)
          frameRequestId = window.requestAnimationFrame(runFrame)
        }

        runFrame()
      } catch (error) {
        if (!isDisposed) {
          setThreePreviewErrorMessage(error instanceof Error ? error.message : 'Failed to load 3D preview.')
        }
      } finally {
        if (!isDisposed) {
          setIsThreePreviewLoading(false)
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
      renderer?.dispose()
      containerElement.innerHTML = ''
      vrmInstance = null
    }
  }, [canOpenThreePreview, characterRecord?.vroidFileUrl, isThreePreviewOpen])

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
                      onClick={() => setIsThreePreviewOpen((previousState) => !previousState)}
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
                    <div className="relative mx-auto h-[420px] w-[210px] overflow-hidden rounded-sm border border-white/10 bg-[#0f1117]">
                      <div ref={threePreviewContainerReference} className="h-full w-full" />
                      {isThreePreviewLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85">
                          Loading 3D preview...
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
                </div>

                {screenshotImageList.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {screenshotImageList.map((imageUrl, index) => (
                      <button
                        key={imageUrl + index.toString()}
                        type="button"
                        onClick={() => {
                          setIsThreePreviewOpen(false)
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
                          <span className="ml-2 text-amber-200">{renderReviewStars(review.rating)}</span>
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
                    <div className="mt-2 flex gap-2">
                      {[1, 2, 3, 4, 5].map((ratingValue) => (
                        <button
                          key={ratingValue}
                          type="button"
                          onClick={() => setReviewInputRating(ratingValue)}
                          className={`rounded border px-2 py-1 text-xs ${
                            reviewInputRating === ratingValue ? 'border-amber-300 text-amber-200' : 'border-white/20 text-white/60'
                          }`}
                          aria-label={`Set review rating to ${ratingValue}`}
                        >
                          {ratingValue}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reviewInputBody}
                      onChange={(event) => setReviewInputBody(event.target.value)}
                      placeholder="Write your review..."
                      className="mt-2 h-24 w-full resize-none rounded border border-white/20 bg-[#0d0d0d] px-3 py-2 text-xs text-white outline-none focus:border-ember-300"
                      aria-label="Review text"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitReview}
                        disabled={isReviewSubmitting}
                        className="rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-black disabled:opacity-70"
                        aria-label={ownReview ? 'Update review' : 'Post review'}
                      >
                        {isReviewSubmitting ? 'Saving...' : ownReview ? 'Update Review' : 'Post Review'}
                      </button>
                      {ownReview ? (
                        <button
                          type="button"
                          onClick={handleDeleteOwnReview}
                          disabled={isReviewSubmitting}
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
