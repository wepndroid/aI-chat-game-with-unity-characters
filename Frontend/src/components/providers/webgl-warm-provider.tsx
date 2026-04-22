'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { getWebGlBridgeToken } from '@/lib/auth-api'
import { AI_GIRLFRIEND_ROUTE_BASE } from '@/lib/ai-girlfriend-route'
import type { WebglPlayContext } from '@/lib/webgl-embed-url'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'

const EMBED_CONTEXT_MESSAGE_TYPE = 'secretwaifu-embed:context' as const
const EMBED_PRELOAD_MODE_MESSAGE_TYPE = 'secretwaifu-embed:preload-mode' as const

const WARM_PRELOAD_PATH_PREFIX_ALLOWLIST = [AI_GIRLFRIEND_ROUTE_BASE, '/characters'] as const

const isWarmPreloadPathAllowed = (pathname: string) => {
  if (pathname === '/') {
    return true
  }

  return WARM_PRELOAD_PATH_PREFIX_ALLOWLIST.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

type WebglWarmContextValue = {
  /** True when the hidden Unity iframe has posted ready (same signal as /play-demo). */
  isWarmReady: boolean
  /** Opens the fullscreen warm overlay when preload is ready; returns false → caller should navigate to href. */
  tryOpenWarmPlay: (context: WebglPlayContext) => boolean
  closeWarmPlay: () => void
}

const WebglWarmContext = createContext<WebglWarmContextValue | null>(null)

const useWebglWarm = () => {
  const value = useContext(WebglWarmContext)
  if (!value) {
    throw new Error('useWebglWarm must be used within WebglWarmProvider.')
  }
  return value
}

const postUserToIframe = (
  contentWindow: Window,
  user: { id: string; username: string; email: string | null; role: string }
) => {
  contentWindow.postMessage(
    {
      type: 'secretwaifu-auth:user',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    },
    '*'
  )
}

const postContextToIframe = (contentWindow: Window, context: WebglPlayContext) => {
  contentWindow.postMessage(
    {
      type: EMBED_CONTEXT_MESSAGE_TYPE,
      characterId: context.characterId,
      character: context.characterSlug,
      storyId: context.storyId
    },
    '*'
  )
}

const postPreloadModeToIframe = (contentWindow: Window, hiddenPreload: boolean) => {
  contentWindow.postMessage(
    {
      type: EMBED_PRELOAD_MODE_MESSAGE_TYPE,
      hiddenPreload
    },
    '*'
  )
}

type WebglWarmProviderProps = {
  children: ReactNode
}

const WebglWarmProvider = ({ children }: WebglWarmProviderProps) => {
  const pathname = usePathname()
  const { sessionUser, isAuthLoading } = useAuth()
  const sessionUserId = sessionUser?.id ?? null
  const webglEmbedUrl = process.env.NEXT_PUBLIC_WEBGL_EMBED_URL?.trim() ?? ''
  const warmPreloadDisabled = process.env.NEXT_PUBLIC_DISABLE_WEBGL_WARM_PRELOAD === 'true'
  const isWarmPathAllowed = isWarmPreloadPathAllowed(pathname)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [unityReady, setUnityReady] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  const shouldMountWarmFrame = Boolean(
    sessionUser &&
      webglEmbedUrl &&
      isWarmPathAllowed &&
      !pathname.startsWith('/play-demo') &&
      !warmPreloadDisabled
  )

  useEffect(() => {
    if (shouldMountWarmFrame) {
      return
    }

    const frameId = requestAnimationFrame(() => {
      setUnityReady(false)
      setOverlayOpen(false)
    })

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [shouldMountWarmFrame])

  useEffect(() => {
    if (!webglEmbedUrl || !shouldMountWarmFrame) {
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

      if (payload.type === 'secretwaifu-webgl:ready') {
        setUnityReady(true)

        if (sessionUser && iframeRef.current?.contentWindow) {
          postUserToIframe(iframeRef.current.contentWindow, sessionUser)
        }
      }
    }

    window.addEventListener('message', onUnityMessage)

    return () => {
      window.removeEventListener('message', onUnityMessage)
    }
  }, [webglEmbedUrl, sessionUser, shouldMountWarmFrame])

  useEffect(() => {
    if (!unityReady || !sessionUserId || !iframeRef.current?.contentWindow) {
      return
    }

    let isCancelled = false

    void (async () => {
      try {
        const payload = await getWebGlBridgeToken()
        if (isCancelled || !iframeRef.current?.contentWindow) {
          return
        }

        iframeRef.current.contentWindow.postMessage(
          {
            type: 'secretwaifu-auth:api-token',
            token: payload.data.token,
            expiresAt: payload.data.expiresAt,
            tokenType: payload.data.tokenType
          },
          '*'
        )
      } catch {
        // Token mint failed (e.g. network); Unity may still use same-site cookies for API if applicable.
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [unityReady, sessionUserId])

  useEffect(() => {
    if (!shouldMountWarmFrame || !iframeRef.current?.contentWindow) {
      return
    }
    postPreloadModeToIframe(iframeRef.current.contentWindow, !overlayOpen)
  }, [overlayOpen, shouldMountWarmFrame])

  const closeWarmPlay = useCallback(() => {
    setOverlayOpen(false)
  }, [])

  useEffect(() => {
    if (!overlayOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeWarmPlay()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeWarmPlay, overlayOpen])

  const tryOpenWarmPlay = useCallback(
    (context: WebglPlayContext) => {
      if (isAuthLoading || !sessionUser || !webglEmbedUrl || !shouldMountWarmFrame) {
        return false
      }

      if (!unityReady || !iframeRef.current?.contentWindow) {
        return false
      }

      setOverlayOpen(true)
      postContextToIframe(iframeRef.current.contentWindow, context)
      return true
    },
    [isAuthLoading, sessionUser, webglEmbedUrl, shouldMountWarmFrame, unityReady]
  )

  const iframeClassName = overlayOpen
    ? 'fixed inset-0 z-[90] h-full w-full border-0 bg-black'
    : 'pointer-events-none fixed -left-[200vw] top-0 z-0 h-[min(480px,100vh)] w-[min(854px,100vw)] border-0 opacity-0'

  const contextValue: WebglWarmContextValue = {
    isWarmReady: unityReady && shouldMountWarmFrame,
    tryOpenWarmPlay,
    closeWarmPlay
  }

  return (
    <WebglWarmContext.Provider value={contextValue}>
      {children}
      {shouldMountWarmFrame ? (
        <>
          <iframe
            ref={iframeRef}
            src={webglEmbedUrl}
            title="AI Chat Game WebGL (warm)"
            className={iframeClassName}
            loading="eager"
            allow="fullscreen; gamepad; autoplay; microphone; camera; clipboard-read; clipboard-write"
            scrolling="no"
            onLoad={() => {
              if (iframeRef.current?.contentWindow) {
                postPreloadModeToIframe(iframeRef.current.contentWindow, !overlayOpen)
              }
            }}
          />
          {overlayOpen ? (
            <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-end px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={closeWarmPlay}
                className="pointer-events-auto rounded-full border border-white/40 bg-black/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-lg backdrop-blur-sm transition hover:border-ember-300/60 hover:bg-black/90"
                aria-label="Close game"
              >
                Close
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </WebglWarmContext.Provider>
  )
}

export { WebglWarmProvider, useWebglWarm }
