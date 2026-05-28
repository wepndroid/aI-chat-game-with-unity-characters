'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { googleAnalyticsReadyEvent, trackGoogleAnalyticsPageView } from '@/lib/google-analytics-events'

const googleAnalyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim() ?? ''

const excludedRoutePrefixes = [
  '/account',
  '/admin',
  '/upload-vrm',
  '/your-characters',
  '/your-scenarios'
] as const

const isExcludedRoute = (pathname: string) => {
  return excludedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

const getCurrentPageKey = () => {
  const renderedQuery = window.location.search.replace(/^\?/, '')
  return renderedQuery ? `${window.location.pathname}?${renderedQuery}` : window.location.pathname
}

const GoogleAnalytics = () => {
  const [b_shouldLoadAnalytics, setShouldLoadAnalytics] = useState(false)

  useEffect(() => {
    if (!googleAnalyticsId || isExcludedRoute(window.location.pathname)) {
      return
    }

    const timerId = window.setTimeout(() => setShouldLoadAnalytics(true), 0)
    return () => window.clearTimeout(timerId)
  }, [])

  if (!googleAnalyticsId || !b_shouldLoadAnalytics) {
    return null
  }

  const encodedGoogleAnalyticsId = encodeURIComponent(googleAnalyticsId)
  const serializedGoogleAnalyticsId = JSON.stringify(googleAnalyticsId)

  return (
    <>
      <GoogleAnalyticsRouteTracker />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodedGoogleAnalyticsId}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', ${serializedGoogleAnalyticsId}, { send_page_view: false });
          window.dispatchEvent(new Event(${JSON.stringify(googleAnalyticsReadyEvent)}));
        `}
      </Script>
    </>
  )
}

const GoogleAnalyticsRouteTracker = () => {
  useEffect(() => {
    let b_disposed = false
    let lastTrackedPageKey: string | null = null
    let retryTimerId: number | null = null
    let routeChangeTimerId: number | null = null

    const clearRetryTimer = () => {
      if (retryTimerId !== null) {
        window.clearTimeout(retryTimerId)
        retryTimerId = null
      }
    }

    const trackCurrentPage = () => {
      if (b_disposed) {
        return
      }

      if (!window.gtag) {
        clearRetryTimer()
        retryTimerId = window.setTimeout(trackCurrentPage, 100)
        return
      }

      const pathname = window.location.pathname
      if (isExcludedRoute(pathname)) {
        return
      }

      const currentPageKey = getCurrentPageKey()
      if (currentPageKey === lastTrackedPageKey) {
        return
      }

      lastTrackedPageKey = currentPageKey
      trackGoogleAnalyticsPageView(pathname, new URLSearchParams(window.location.search))
    }

    const scheduleRouteTracking = () => {
      if (routeChangeTimerId !== null) {
        window.clearTimeout(routeChangeTimerId)
      }

      routeChangeTimerId = window.setTimeout(trackCurrentPage, 0)
    }

    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function pushState(...args: Parameters<typeof originalPushState>) {
      const result = originalPushState.apply(window.history, args)
      scheduleRouteTracking()
      return result
    }

    window.history.replaceState = function replaceState(...args: Parameters<typeof originalReplaceState>) {
      const result = originalReplaceState.apply(window.history, args)
      scheduleRouteTracking()
      return result
    }

    window.addEventListener('popstate', scheduleRouteTracking)
    window.addEventListener(googleAnalyticsReadyEvent, trackCurrentPage)
    trackCurrentPage()

    return () => {
      b_disposed = true
      clearRetryTimer()
      if (routeChangeTimerId !== null) {
        window.clearTimeout(routeChangeTimerId)
      }
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      window.removeEventListener('popstate', scheduleRouteTracking)
      window.removeEventListener(googleAnalyticsReadyEvent, trackCurrentPage)
    }
  }, [])

  return null
}

export default GoogleAnalytics
