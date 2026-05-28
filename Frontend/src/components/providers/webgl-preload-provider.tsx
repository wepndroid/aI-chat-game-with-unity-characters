'use client'

import {
  fetchPublicWebglPreloadManifest,
  scheduleWebglReleasePreload,
  startWebglReleasePreload,
  type WebglReleasePreloadManifest
} from '@/lib/webgl-preload'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type WebglPreloadContextValue = {
  manifest: WebglReleasePreloadManifest | null
  preloadOnIntent: () => void
}

type WebglPreloadProviderProps = {
  children: React.ReactNode
}

const WebglPreloadContext = createContext<WebglPreloadContextValue>({
  manifest: null,
  preloadOnIntent: () => {}
})

const WebglPreloadProvider = ({ children }: WebglPreloadProviderProps) => {
  const [manifest, setManifest] = useState<WebglReleasePreloadManifest | null>(null)

  useEffect(() => {
    let isCancelled = false

    void (async () => {
      const nextManifest = await fetchPublicWebglPreloadManifest().catch(() => null)
      if (!isCancelled) {
        setManifest(nextManifest)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    return scheduleWebglReleasePreload(manifest, { mode: 'background' })
  }, [manifest])

  const preloadOnIntent = useCallback(() => {
    startWebglReleasePreload(manifest, { mode: 'intent' })
  }, [manifest])

  const contextValue = useMemo(
    () => ({
      manifest,
      preloadOnIntent
    }),
    [manifest, preloadOnIntent]
  )

  return <WebglPreloadContext.Provider value={contextValue}>{children}</WebglPreloadContext.Provider>
}

const useWebglPreloadIntent = () => useContext(WebglPreloadContext)

export { WebglPreloadProvider, useWebglPreloadIntent }
