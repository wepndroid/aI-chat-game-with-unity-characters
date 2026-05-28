'use client'

import { useAuth } from '@/components/providers/auth-provider'
import LatestUpdateCard from '@/components/ui-elements/latest-update-card'
import PlatformItem from '@/components/ui-elements/platform-item'
import type { PlatformIconType } from '@/components/ui-elements/platform-item'
import { getWebGlBridgeToken, issueWebglStoryLaunchContext } from '@/lib/auth-api'
import { MEMBERSHIP_ROUTE, canSessionUserAccessGame } from '@/lib/membership-access'
import { EMAIL_VERIFICATION_PROFILE_HREF, REGISTERED_CHARACTER_SIGN_UP_HREF } from '@/lib/registered-character-access'
import { scheduleWebglReleasePreload, type WebglReleasePreloadManifest } from '@/lib/webgl-preload'
import {
  isWebglAuthSessionReadyMessage,
  isWebglLoaderErrorMessage,
  isWebglProgressMessage,
  isWebglReadyMessage,
  postWebglApiToken,
  postWebglApiTokenRefresh,
  postWebglLaunchToken
} from '@/lib/webgl-bridge-messages'
import {
  createWebglLaunchWatchdogState,
  failWebglLaunchWatchdog,
  getWebglLaunchWatchdogDelay,
  getWebglLaunchWatchdogFailure,
  recordWebglLaunchActivity
} from '@/lib/webgl-launch-watchdog'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

const BYTES_PER_MB = 1_000_000
const WEBGL_TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000
const WEBGL_TOKEN_REFRESH_MIN_DELAY_MS = 5_000
const WEBGL_TOKEN_REFRESH_EXPIRY_MARGIN_MS = 1_000
const WEBGL_TOKEN_REFRESH_ACK_TIMEOUT_MS = 15_000
const WEBGL_TOKEN_REFRESH_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000] as const
const WEBGL_SESSION_EXPIRED_MESSAGE = 'Your browser game session expired. Please refresh the page to start a new session.'

type PlayClientProps = {
  webglEmbedUrl: string
  webglPreloadManifest: WebglReleasePreloadManifest | null
  localCoreDownloadTotalBytes: number | null
  releaseVersionLabel: string | null
  releaseNewsArticle: {
    slug: string
    title: string
    summary: string | null
  } | null
}

type DownloadProgressState = {
  downloadedBytes: number | null
  totalBytes: number | null
}

const PlayAuthGateFallback = () => (
  <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
    <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading...</div>
  </main>
)

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
    const leftPercent = (index * 17.37) % 100
    const sizePx = 4 + ((index * 11) % 9)
    const durationSeconds = 6 + ((index * 7) % 8)
    const delaySeconds = -((index * 1.2) % 10.5)
    const driftPx = (index % 2 === 0 ? 1 : -1) * (8 + (index % 6) * 3)

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

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const clampBytes = (value: number, totalBytes: number | null) => {
  const normalizedValue = Math.max(0, Math.round(value))
  if (!totalBytes || totalBytes <= 0) {
    return normalizedValue
  }

  return Math.min(totalBytes, normalizedValue)
}

const formatMegabytes = (value: number) => `${(value / BYTES_PER_MB).toFixed(1)} MB`

const resolveDownloadProgressLabel = (downloadProgress: DownloadProgressState) => {
  if (downloadProgress.downloadedBytes !== null && downloadProgress.totalBytes !== null) {
    return `${formatMegabytes(downloadProgress.downloadedBytes)} / ${formatMegabytes(downloadProgress.totalBytes)} downloaded`
  }

  if (downloadProgress.downloadedBytes !== null) {
    return `${formatMegabytes(downloadProgress.downloadedBytes)} downloaded`
  }

  if (downloadProgress.totalBytes !== null) {
    return `${formatMegabytes(downloadProgress.totalBytes)} total download`
  }

  return null
}

const toLaunchErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Unable to start this WebGL launch.'
}

const parseExpiryTime = (expiresAt: string) => {
  const expiryTime = Date.parse(expiresAt)
  return Number.isFinite(expiryTime) ? expiryTime : null
}

const resolveTokenRefreshDelay = (expiresAt: string, attemptIndex: number) => {
  const expiryTime = parseExpiryTime(expiresAt)
  if (expiryTime === null) {
    return null
  }

  const millisecondsUntilExpiry = expiryTime - Date.now()
  const millisecondsUntilRefresh = millisecondsUntilExpiry - WEBGL_TOKEN_REFRESH_SAFETY_WINDOW_MS
  if (attemptIndex > 0) {
    const retryDelay = WEBGL_TOKEN_REFRESH_RETRY_DELAYS_MS[Math.min(attemptIndex - 1, WEBGL_TOKEN_REFRESH_RETRY_DELAYS_MS.length - 1)]
    return Math.max(0, Math.min(retryDelay, millisecondsUntilExpiry - WEBGL_TOKEN_REFRESH_EXPIRY_MARGIN_MS))
  }

  if (millisecondsUntilRefresh <= 0) {
    return Math.max(
      0,
      Math.min(WEBGL_TOKEN_REFRESH_MIN_DELAY_MS, millisecondsUntilExpiry - WEBGL_TOKEN_REFRESH_EXPIRY_MARGIN_MS)
    )
  }

  return Math.max(WEBGL_TOKEN_REFRESH_MIN_DELAY_MS, millisecondsUntilRefresh)
}

const isTokenExpired = (expiresAt: string) => {
  const expiryTime = parseExpiryTime(expiresAt)
  return expiryTime === null || Date.now() >= expiryTime
}

type PlayPlatformLink = {
  id: string
  label: string
  iconType: PlatformIconType
  href: string
  ariaLabel: string
}

const playPlatformLinks: PlayPlatformLink[] = [
  {
    id: 'browser',
    label: 'Browser',
    iconType: 'browser',
    href: '/play',
    ariaLabel: 'Play the browser version'
  },
  {
    id: 'windows',
    label: 'Windows',
    iconType: 'windows',
    href: '/download',
    ariaLabel: 'Open Windows download options'
  },
  {
    id: 'pcvr',
    label: 'PCVR',
    iconType: 'pcvr',
    href: '/chat-faq',
    ariaLabel: 'Read PCVR and headset FAQs'
  },
  {
    id: 'exe',
    label: 'EXE',
    iconType: 'exe',
    href: '/download',
    ariaLabel: 'Open Windows executable download options'
  }
]

const PlayClient = ({
  webglEmbedUrl,
  webglPreloadManifest,
  localCoreDownloadTotalBytes,
  releaseVersionLabel,
  releaseNewsArticle
}: PlayClientProps) => {
  const router = useRouter()
  const { sessionUser, isAuthLoading } = useAuth()
  const sessionUserId = sessionUser?.id ?? null
  const searchParams = useSearchParams()
  const launchStoryIdParam = searchParams.get('launchStoryId')
  const launchStoryId = launchStoryIdParam?.trim() ?? ''
  const isChatNowLaunch = launchStoryIdParam !== null
  const canAccessGame = canSessionUserAccessGame(sessionUser)

  useEffect(() => {
    return scheduleWebglReleasePreload(webglPreloadManifest, { mode: 'launch' })
  }, [webglPreloadManifest])

  useEffect(() => {
    if (isAuthLoading) {
      return
    }
    if (!sessionUser) {
      window.location.assign(REGISTERED_CHARACTER_SIGN_UP_HREF)
      return
    }
    if (!sessionUser.isEmailVerified) {
      router.replace(EMAIL_VERIFICATION_PROFILE_HREF)
      return
    }
    if (!canSessionUserAccessGame(sessionUser)) {
      router.replace(MEMBERSHIP_ROUTE)
    }
  }, [isAuthLoading, sessionUser, router])

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const postedApiTokenKeyRef = useRef<string | null>(null)
  const postedLaunchTokenKeyRef = useRef<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [unityReady, setUnityReady] = useState(false)
  const [hasUnityProgressFeed, setHasUnityProgressFeed] = useState(false)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(Boolean(webglEmbedUrl))
  const [launchErrorMessage, setLaunchErrorMessage] = useState<string | null>(null)
  const [webglLaunchWatchdogState, setWebglLaunchWatchdogState] = useState(() => createWebglLaunchWatchdogState(Date.now(), null))
  const [apiTokenRefreshExpiresAt, setApiTokenRefreshExpiresAt] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState>({
    downloadedBytes: null,
    totalBytes: null
  })

  const resolvedWebglEmbedUrl = useMemo(() => {
    return webglEmbedUrl || null
  }, [webglEmbedUrl])

  const resolvedWebglEmbedOrigin = useMemo(() => {
    if (!resolvedWebglEmbedUrl) {
      return null
    }

    try {
      return new URL(resolvedWebglEmbedUrl).origin
    } catch {
      return null
    }
  }, [resolvedWebglEmbedUrl])

  const routeLaunchError =
    isChatNowLaunch && !launchStoryId ? 'A story is required before launching chat.' : null
  const webglBridgeError = resolvedWebglEmbedUrl && !resolvedWebglEmbedOrigin
    ? 'The WebGL embed URL must be an absolute URL.'
    : routeLaunchError

  const webglLaunchKey = useMemo(() => {
    if (!resolvedWebglEmbedUrl || !resolvedWebglEmbedOrigin || webglBridgeError) {
      return null
    }

    return JSON.stringify({
      mode: isChatNowLaunch ? 'chat-now' : 'play',
      origin: resolvedWebglEmbedOrigin,
      sessionUserId,
      storyId: isChatNowLaunch ? launchStoryId : null,
      url: resolvedWebglEmbedUrl
    })
  }, [isChatNowLaunch, launchStoryId, resolvedWebglEmbedOrigin, resolvedWebglEmbedUrl, sessionUserId, webglBridgeError])

  const fallbackTotalBytes = useMemo(() => {
    if (!resolvedWebglEmbedUrl || !localCoreDownloadTotalBytes || localCoreDownloadTotalBytes <= 0) {
      return null
    }

    return localCoreDownloadTotalBytes
  }, [localCoreDownloadTotalBytes, resolvedWebglEmbedUrl])

  useEffect(() => {
    setWebglLaunchWatchdogState(createWebglLaunchWatchdogState(Date.now(), webglLaunchKey))
    setLoadingProgress(0)
    setIframeLoaded(false)
    setUnityReady(false)
    setHasUnityProgressFeed(false)
    setShowLoadingOverlay(true)
    setLaunchErrorMessage(null)
    setApiTokenRefreshExpiresAt(null)
    postedApiTokenKeyRef.current = null
    postedLaunchTokenKeyRef.current = null
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    setDownloadProgress({
      downloadedBytes: null,
      totalBytes: fallbackTotalBytes
    })
  }, [fallbackTotalBytes, webglLaunchKey])

  useEffect(() => {
    if (!webglLaunchKey || webglBridgeError || unityReady || launchErrorMessage) {
      return
    }

    const currentFailure = getWebglLaunchWatchdogFailure(webglLaunchWatchdogState, Date.now())
    if (currentFailure) {
      setWebglLaunchWatchdogState((currentState) => failWebglLaunchWatchdog(currentState, currentFailure))
      setLaunchErrorMessage(currentFailure.message)
      return
    }

    const watchdogDelay = getWebglLaunchWatchdogDelay(webglLaunchWatchdogState, Date.now())
    if (watchdogDelay === null) {
      return
    }

    const watchdogTimeoutId = window.setTimeout(() => {
      const nextFailure = getWebglLaunchWatchdogFailure(webglLaunchWatchdogState, Date.now())
      if (nextFailure) {
        setWebglLaunchWatchdogState((currentState) => failWebglLaunchWatchdog(currentState, nextFailure))
        setLaunchErrorMessage(nextFailure.message)
      }
    }, watchdogDelay)

    return () => {
      window.clearTimeout(watchdogTimeoutId)
    }
  }, [launchErrorMessage, unityReady, webglBridgeError, webglLaunchKey, webglLaunchWatchdogState])

  useEffect(() => {
    if (!resolvedWebglEmbedUrl || !resolvedWebglEmbedOrigin || !webglLaunchKey) {
      return
    }

    const onUnityMessage = (event: MessageEvent) => {
      const matchesIframeWindow = Boolean(iframeRef.current?.contentWindow) && event.source === iframeRef.current?.contentWindow
      const matchesIframeOrigin = event.origin === resolvedWebglEmbedOrigin

      if (!matchesIframeWindow || !matchesIframeOrigin) {
        return
      }

      const payload = event.data

      if (isWebglProgressMessage(payload)) {
        setWebglLaunchWatchdogState((currentState) => recordWebglLaunchActivity(currentState, 'unity-progress', Date.now()))
        const normalizedPercent = Math.max(0, Math.min(100, payload.progress * 100))
        const payloadTotalBytes =
          isFiniteNumber(payload.totalBytes) && payload.totalBytes > 0 ? Math.round(payload.totalBytes) : null
        const resolvedTotalBytes = payloadTotalBytes ?? fallbackTotalBytes
        const payloadDownloadedBytes =
          isFiniteNumber(payload.downloadedBytes) && payload.downloadedBytes >= 0
            ? clampBytes(payload.downloadedBytes, resolvedTotalBytes)
            : null
        const derivedDownloadedBytes =
          resolvedTotalBytes !== null ? Math.round((normalizedPercent / 100) * resolvedTotalBytes) : null

        setHasUnityProgressFeed(true)
        setLoadingProgress(Number(normalizedPercent.toFixed(2)))
        setDownloadProgress({
          downloadedBytes: payloadDownloadedBytes ?? derivedDownloadedBytes,
          totalBytes: resolvedTotalBytes
        })
        return
      }

      if (isWebglReadyMessage(payload)) {
        if (launchErrorMessage) {
          return
        }

        setWebglLaunchWatchdogState((currentState) => recordWebglLaunchActivity(currentState, 'unity-ready', Date.now()))
        setHasUnityProgressFeed(true)
        setUnityReady(true)
        setLoadingProgress(100)
        setDownloadProgress((previousState) => {
          const resolvedTotalBytes =
            isFiniteNumber(payload.totalBytes) && payload.totalBytes > 0
              ? Math.round(payload.totalBytes)
              : previousState.totalBytes ?? fallbackTotalBytes

          return {
            downloadedBytes: resolvedTotalBytes,
            totalBytes: resolvedTotalBytes
          }
        })
        return
      }

      if (isWebglLoaderErrorMessage(payload)) {
        setWebglLaunchWatchdogState((currentState) => recordWebglLaunchActivity(currentState, 'unity-loader-error', Date.now()))
        setLaunchErrorMessage(payload.message)
        return
      }

      if (isWebglAuthSessionReadyMessage(payload)) {
        setApiTokenRefreshExpiresAt(payload.expiresAt)
      }
    }

    window.addEventListener('message', onUnityMessage)

    return () => {
      window.removeEventListener('message', onUnityMessage)
    }
  }, [fallbackTotalBytes, launchErrorMessage, resolvedWebglEmbedOrigin, resolvedWebglEmbedUrl, webglLaunchKey])

  useEffect(() => {
    if (
      isChatNowLaunch ||
      !unityReady ||
      !sessionUserId ||
      !resolvedWebglEmbedOrigin ||
      launchErrorMessage ||
      !iframeRef.current?.contentWindow
    ) {
      return
    }

    const dispatchKey = `${sessionUserId}:${resolvedWebglEmbedOrigin}`
    if (postedApiTokenKeyRef.current === dispatchKey) {
      return
    }

    let isCancelled = false
    postedApiTokenKeyRef.current = dispatchKey

    void (async () => {
      try {
        const payload = await getWebGlBridgeToken()
        if (isCancelled || !iframeRef.current?.contentWindow) {
          return
        }

        postWebglApiToken(iframeRef.current.contentWindow, resolvedWebglEmbedOrigin, payload.data)
      } catch (error) {
        if (!isCancelled) {
          postedApiTokenKeyRef.current = null
          setLaunchErrorMessage(toLaunchErrorMessage(error))
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [isChatNowLaunch, launchErrorMessage, resolvedWebglEmbedOrigin, unityReady, sessionUserId])

  useEffect(() => {
    if (
      !isChatNowLaunch ||
      !launchStoryId ||
      !unityReady ||
      !sessionUserId ||
      !resolvedWebglEmbedOrigin ||
      launchErrorMessage ||
      !iframeRef.current?.contentWindow
    ) {
      return
    }

    const dispatchKey = `${sessionUserId}:${launchStoryId}:${resolvedWebglEmbedOrigin}`
    if (postedLaunchTokenKeyRef.current === dispatchKey) {
      return
    }

    let isCancelled = false
    postedLaunchTokenKeyRef.current = dispatchKey

    void (async () => {
      try {
        const payload = await issueWebglStoryLaunchContext(launchStoryId)
        if (payload.data.storyId !== launchStoryId) {
          throw new Error('The launch context did not match the selected story.')
        }
        if (isCancelled || !iframeRef.current?.contentWindow) {
          return
        }

        postWebglLaunchToken(iframeRef.current.contentWindow, resolvedWebglEmbedOrigin, {
          launchToken: payload.data.launchToken,
          expiresAt: payload.data.expiresAt
        })
      } catch (error) {
        if (!isCancelled) {
          postedLaunchTokenKeyRef.current = null
          setLaunchErrorMessage(toLaunchErrorMessage(error))
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [isChatNowLaunch, launchErrorMessage, launchStoryId, resolvedWebglEmbedOrigin, unityReady, sessionUserId])

  useEffect(() => {
    if (
      !apiTokenRefreshExpiresAt ||
      !resolvedWebglEmbedUrl ||
      !resolvedWebglEmbedOrigin ||
      !sessionUserId ||
      !unityReady ||
      launchErrorMessage
    ) {
      return
    }

    let isCancelled = false

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }

    const expireSession = () => {
      if (!isCancelled) {
        setLaunchErrorMessage(WEBGL_SESSION_EXPIRED_MESSAGE)
      }
    }

    const scheduleRefresh = (expiresAt: string, attemptIndex: number) => {
      clearRefreshTimer()

      if (isTokenExpired(expiresAt)) {
        expireSession()
        return
      }

      const refreshDelay = resolveTokenRefreshDelay(expiresAt, attemptIndex)
      if (refreshDelay === null) {
        expireSession()
        return
      }

      refreshTimerRef.current = window.setTimeout(() => {
        void refreshToken(expiresAt, attemptIndex)
      }, refreshDelay)
    }

    const scheduleExpiryError = (expiresAt: string) => {
      clearRefreshTimer()
      const expiryTime = parseExpiryTime(expiresAt)
      if (expiryTime === null) {
        expireSession()
        return
      }

      refreshTimerRef.current = window.setTimeout(expireSession, Math.max(0, expiryTime - Date.now()))
    }

    const scheduleRefreshAckTimeout = (expiresAt: string, attemptIndex: number) => {
      clearRefreshTimer()

      if (attemptIndex >= WEBGL_TOKEN_REFRESH_RETRY_DELAYS_MS.length) {
        scheduleExpiryError(expiresAt)
        return
      }

      const expiryTime = parseExpiryTime(expiresAt)
      if (expiryTime === null) {
        expireSession()
        return
      }

      const millisecondsUntilExpiry = expiryTime - Date.now()
      const retryDelay = Math.min(
        WEBGL_TOKEN_REFRESH_ACK_TIMEOUT_MS,
        Math.max(0, millisecondsUntilExpiry - WEBGL_TOKEN_REFRESH_EXPIRY_MARGIN_MS)
      )

      refreshTimerRef.current = window.setTimeout(() => {
        void refreshToken(expiresAt, attemptIndex + 1)
      }, retryDelay)
    }

    const refreshToken = async (expiresAt: string, attemptIndex: number): Promise<void> => {
      if (isCancelled || isTokenExpired(expiresAt)) {
        expireSession()
        return
      }

      try {
        const payload = await getWebGlBridgeToken()
        if (isCancelled) {
          return
        }

        const targetWindow = iframeRef.current?.contentWindow
        if (!targetWindow) {
          if (attemptIndex >= WEBGL_TOKEN_REFRESH_RETRY_DELAYS_MS.length) {
            scheduleExpiryError(expiresAt)
            return
          }

          scheduleRefresh(expiresAt, attemptIndex + 1)
          return
        }

        postWebglApiTokenRefresh(targetWindow, resolvedWebglEmbedOrigin, payload.data)
        scheduleRefreshAckTimeout(expiresAt, attemptIndex)
      } catch {
        if (isCancelled) {
          return
        }
        if (isTokenExpired(expiresAt)) {
          expireSession()
          return
        }
        if (attemptIndex >= WEBGL_TOKEN_REFRESH_RETRY_DELAYS_MS.length) {
          scheduleExpiryError(expiresAt)
          return
        }

        scheduleRefresh(expiresAt, attemptIndex + 1)
      }
    }

    scheduleRefresh(apiTokenRefreshExpiresAt, 0)

    return () => {
      isCancelled = true
      clearRefreshTimer()
    }
  }, [
    apiTokenRefreshExpiresAt,
    isChatNowLaunch,
    launchErrorMessage,
    launchStoryId,
    resolvedWebglEmbedOrigin,
    resolvedWebglEmbedUrl,
    sessionUserId,
    unityReady
  ])

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
  const downloadProgressLabel = useMemo(() => resolveDownloadProgressLabel(downloadProgress), [downloadProgress])

  if (isAuthLoading || !sessionUser || !sessionUser.isEmailVerified || !canAccessGame) {
    return <PlayAuthGateFallback />
  }

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-[96rem] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            Play in Browser
          </h1>
          {releaseVersionLabel ? (
            <p className="mx-auto mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-300/80">
              Live WebGL version: {releaseVersionLabel}
            </p>
          ) : null}
          {isChatNowLaunch ? (
            <p className="mx-auto mt-4 max-w-3xl text-center text-xs font-semibold uppercase tracking-[0.12em] text-ember-200/75">
              Starting selected story chat
            </p>
          ) : null}
          {launchErrorMessage ? (
            <p className="mx-auto mt-4 max-w-3xl rounded-md border border-red-400/35 bg-red-500/10 px-4 py-3 text-center text-sm leading-6 text-red-100" role="alert">
              {launchErrorMessage}
            </p>
          ) : null}
          <div className="mx-auto mt-8 w-full overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0b] shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
            <div className="relative aspect-video w-full">
              {resolvedWebglEmbedUrl && !webglBridgeError ? (
                <>
                  <iframe
                    key={webglLaunchKey ?? resolvedWebglEmbedUrl}
                    ref={iframeRef}
                    src={resolvedWebglEmbedUrl}
                    title="AI Chat Game WebGL"
                    className={`h-full w-full overflow-hidden border-0 transition-opacity duration-500 ${
                      showLoadingOverlay ? 'opacity-0' : 'opacity-100'
                    }`}
                    loading="eager"
                    allow="fullscreen; gamepad; autoplay; microphone; camera; clipboard-read; clipboard-write"
                    scrolling="no"
                    onLoad={() => {
                      setIframeLoaded(true)
                      setWebglLaunchWatchdogState((currentState) => recordWebglLaunchActivity(currentState, 'iframe-load', Date.now()))
                    }}
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
                            <div className="min-w-0">
                              <p className="text-sm font-semibold tracking-[0.01em] text-[#d8d2cc]">{loadingMessage}</p>
                              {downloadProgressLabel ? (
                                <p className="mt-1 text-xs text-[#c9b29d]">{downloadProgressLabel}</p>
                              ) : null}
                            </div>
                            <p className="shrink-0 text-xl font-semibold text-[#d39a6b]">{progressPercent}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                  <p className="font-[family-name:var(--font-heading)] text-4xl font-semibold italic text-white">Browser Build Unavailable</p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                    {webglBridgeError ?? 'The browser game is not available right now. Please check back after the next WebGL release is published.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <LatestUpdateCard article={releaseNewsArticle} className="mt-8" />

          <div className="mt-8 flex w-full flex-col items-center gap-4">
            <Link
              href="/download"
              className="inline-flex h-11 w-full max-w-[320px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label="Play on other platforms"
            >
              Play on other platforms
            </Link>

            <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-4">
              {playPlatformLinks.map((platformItem) => (
                <PlatformItem
                  key={platformItem.id}
                  label={platformItem.label}
                  iconType={platformItem.iconType}
                  href={platformItem.href}
                  ariaLabel={platformItem.ariaLabel}
                />
              ))}
            </div>
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

export default PlayClient
