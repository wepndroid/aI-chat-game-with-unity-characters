'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

const resolveLoadingMessage = (progressValue: number, iframeLoaded: boolean, hasUnityProgressFeed: boolean) => {
  if (!hasUnityProgressFeed) {
    return iframeLoaded ? 'Waiting for Unity progress feed...' : 'Loading WebGL frame...'
  }

  if (progressValue >= 99) {
    return 'Ready. Launching game...'
  }

  if (progressValue < 12) {
    return 'Initializing runtime...'
  }

  if (progressValue < 28) {
    return 'Preparing WebGL context...'
  }

  if (progressValue < 45) {
    return 'Loading core bundles...'
  }

  if (progressValue < 62) {
    return 'Streaming game assets...'
  }

  if (progressValue < 78) {
    return 'Compiling shaders...'
  }

  if (progressValue < 90) {
    return 'Polishing textures...'
  }

  if (progressValue < 98) {
    return 'Finalizing scene...'
  }

  return 'Almost ready...'
}

type OverlayDropSpec = {
  id: number
  leftPercent: number
  sizePx: number
  durationSeconds: number
  delaySeconds: number
  driftPx: number
}

const buildOverlayDropSpecs = (count: number): OverlayDropSpec[] => {
  return Array.from({ length: count }, (_value, index) => {
    const leftPercent = ((index * 17.37) % 100)
    const sizePx = 4 + ((index * 11) % 9)
    const durationSeconds = 6 + ((index * 7) % 8)
    const delaySeconds = -((index * 1.2) % 10.5)
    const driftPx = ((index % 2 === 0 ? 1 : -1) * (8 + (index % 6) * 3))

    return {
      id: index,
      leftPercent,
      sizePx,
      durationSeconds,
      delaySeconds,
      driftPx
    }
  })
}

const PlayDemoPage = () => {
  const webglEmbedUrl = process.env.NEXT_PUBLIC_WEBGL_EMBED_URL
  const trailerEmbedUrl = process.env.NEXT_PUBLIC_TRAILER_EMBED_URL
  const trailerVideoUrl = process.env.NEXT_PUBLIC_TRAILER_VIDEO_URL
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [unityReady, setUnityReady] = useState(false)
  const [hasUnityProgressFeed, setHasUnityProgressFeed] = useState(false)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(Boolean(webglEmbedUrl))

  useEffect(() => {
    if (!webglEmbedUrl) {
      return
    }

    const onUnityMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return
      }

      const payload = event.data as { type?: string; progress?: number } | null

      if (!payload?.type) {
        return
      }

      if (payload.type === 'secretwaifu-webgl:progress' && typeof payload.progress === 'number') {
        const normalizedPercent = Math.max(0, Math.min(100, payload.progress * 100))
        setHasUnityProgressFeed(true)
        setLoadingProgress(Number(normalizedPercent.toFixed(2)))
        return
      }

      if (payload.type === 'secretwaifu-webgl:ready') {
        setHasUnityProgressFeed(true)
        setUnityReady(true)
        setLoadingProgress(100)
      }
    }

    window.addEventListener('message', onUnityMessage)

    return () => {
      window.removeEventListener('message', onUnityMessage)
    }
  }, [webglEmbedUrl])

  useEffect(() => {
    const canHideOverlay = unityReady && loadingProgress >= 100

    if (!canHideOverlay) {
      return
    }

    const hideOverlayTimerId = window.setTimeout(() => {
      setShowLoadingOverlay(false)
    }, 450)

    return () => {
      window.clearTimeout(hideOverlayTimerId)
    }
  }, [loadingProgress, unityReady])

  const clampedProgress = Math.max(0, Math.min(100, loadingProgress))
  const displayedProgress = hasUnityProgressFeed ? clampedProgress : 0
  const progressPercent = Math.max(0, Math.min(100, Math.floor(displayedProgress)))
  const overlayDropSpecs = useMemo(() => buildOverlayDropSpecs(34), [])
  const loadingMessage = useMemo(
    () => resolveLoadingMessage(progressPercent, iframeLoaded, hasUnityProgressFeed),
    [hasUnityProgressFeed, iframeLoaded, progressPercent]
  )

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-6xl pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            WebGL Demo
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">
            Play the browser demo below, then continue to download or membership options for full access.
          </p>

          <div className="mx-auto mt-8 w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0b] shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
            <div className="relative aspect-video w-full">
              {webglEmbedUrl ? (
                <>
                  <iframe
                    ref={iframeRef}
                    src={webglEmbedUrl}
                    title="AI Chat Game WebGL Demo"
                    className={`h-full w-full overflow-hidden border-0 transition-opacity duration-500 ${
                      showLoadingOverlay ? 'opacity-0' : 'opacity-100'
                    }`}
                    loading="lazy"
                    allow="fullscreen; gamepad; autoplay; microphone; camera; clipboard-read; clipboard-write"
                    scrolling="no"
                    onLoad={() => setIframeLoaded(true)}
                  />

                  {showLoadingOverlay ? (
                    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(255,186,120,0.18),rgba(8,9,13,0.9)_38%,rgba(5,7,11,0.96)_68%)] p-4 sm:p-6">
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,173,102,0.08)_16%,transparent_32%,transparent_48%,rgba(255,173,102,0.07)_63%,transparent_78%,rgba(255,173,102,0.05)_100%)] opacity-85" />

                      <div className="overlay-drop-layer pointer-events-none absolute inset-0">
                        {overlayDropSpecs.map((dropSpec) => {
                          const dropStyle = {
                            left: `${dropSpec.leftPercent}%`,
                            width: `${dropSpec.sizePx}px`,
                            height: `${dropSpec.sizePx}px`,
                            animationDuration: `${dropSpec.durationSeconds}s`,
                            animationDelay: `${dropSpec.delaySeconds}s`,
                            '--drop-drift': `${dropSpec.driftPx}px`
                          } as CSSProperties

                          return <span key={dropSpec.id} className="overlay-drop" style={dropStyle} />
                        })}
                      </div>

                      <div className="relative z-10 flex h-full w-full items-center justify-center">
                        <div className="w-full max-w-[760px] rounded-2xl border border-[#a96f44]/65 bg-[linear-gradient(180deg,rgba(55,39,27,0.92),rgba(36,27,20,0.92))] px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.5)] sm:px-6 sm:py-5">
                        <div className="h-7 rounded-full border border-[#3f3125] bg-[#11141b] p-[3px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)]">
                          <div
                            className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#bc7e4f] via-[#d79664] to-[#e5a773] shadow-[0_0_14px_rgba(230,161,105,0.42)] transition-[width] duration-200 ease-out"
                            style={{ width: `${displayedProgress.toFixed(2)}%` }}
                          >
                            {displayedProgress > 0 ? <div className="loader-stripe-layer absolute inset-0 rounded-full opacity-55" /> : null}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold tracking-[0.01em] text-[#d8d2cc]">{loadingMessage}</p>
                          <p className="text-xl font-semibold text-[#d39a6b]">{progressPercent}%</p>
                        </div>
                      </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                  <p className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white">WebGL Embed Placeholder</p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                    Set `NEXT_PUBLIC_WEBGL_EMBED_URL` to the live game build URL to activate this demo frame.
                  </p>
                </div>
              )}
            </div>
          </div>

          <section className="mx-auto mt-8 w-full max-w-5xl">
            <h2 className="font-[family-name:var(--font-heading)] text-[38px] font-semibold italic leading-none text-white">
              Trailer Preview
            </h2>

            <div className="mt-4 overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0b]">
              <div className="aspect-video w-full">
                {trailerEmbedUrl ? (
                  <iframe
                    src={trailerEmbedUrl}
                    title="AI Chat Game Trailer"
                    className="h-full w-full"
                    loading="lazy"
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : trailerVideoUrl ? (
                  <video src={trailerVideoUrl} controls className="h-full w-full bg-black" preload="metadata" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-6 text-center">
                    <p className="text-sm text-white/70">Set trailer env vars to display the official trailer here.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/download"
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label="Go to download and purchase options"
            >
              Get Full Version
            </Link>
            <Link
              href="/characters"
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md border border-white/20 px-6 text-xs font-semibold uppercase tracking-[0.1em] text-white transition hover:border-ember-300 hover:text-ember-200"
              aria-label="Browse characters"
            >
              Browse Characters
            </Link>
          </div>
        </div>
      </section>

      <style jsx>{`
        .loader-stripe-layer {
          left: -24px;
          right: -24px;
          background-image: repeating-linear-gradient(
            -45deg,
            rgba(92, 57, 31, 0.9) 0px,
            rgba(92, 57, 31, 0.9) 12px,
            rgba(173, 111, 65, 0.7) 12px,
            rgba(173, 111, 65, 0.7) 24px
          );
          background-position: 0 0;
          animation: stripe-flow-right 1.1s linear infinite;
        }

        .overlay-drop {
          position: absolute;
          bottom: -22px;
          border-radius: 9999px;
          background: radial-gradient(circle at 35% 35%, rgba(255, 212, 166, 0.95), rgba(228, 151, 88, 0.84));
          box-shadow: 0 0 14px rgba(232, 159, 96, 0.42);
          animation-name: drop-rise;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
          opacity: 0;
        }

        @keyframes stripe-flow-right {
          from {
            background-position: 0 0;
          }
          to {
            background-position: 24px 0;
          }
        }

        @keyframes drop-rise {
          0% {
            transform: translate3d(0, 20vh, 0) scale(0.75);
            opacity: 0;
          }

          12% {
            opacity: 0.95;
          }

          84% {
            opacity: 0.95;
          }

          100% {
            transform: translate3d(var(--drop-drift), -82vh, 0) scale(1.12);
            opacity: 0;
          }
        }
      `}</style>
    </main>
  )
}

export default PlayDemoPage
