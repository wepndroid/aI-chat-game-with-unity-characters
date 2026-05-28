import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import {
  readGoogleAnalyticsClientContext,
  trackLandingPageVisitEvent,
  trackLandingSignupClickEvent
} from '@/lib/google-analytics-events'

type TrackLandingVisitPayload = {
  landingPageKey: string
  landingPageName?: string
  variantKey?: string
  variantName?: string
  shortUrlKey?: string | null
  routePath: string
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
  term?: string | null
  landingUrl?: string | null
  referrer?: string | null
  gaClientId?: string | null
  gaSessionId?: string | null
}

type LandingPageKpis = {
  uniqueVisitors: number
  totalVisits: number
  signupClicks: number
  signups: number
  patreonSales: number
  totalPurchases: number
  firstPurchaseRevenueCents: number
  totalRevenueCents: number
  currentMonthlySubscriptionEarningCents: number
  currentSubscribers: number
  clickThroughRate: number
  signupConversionRate: number
  patreonSaleRate: number
}

type LandingPageDailyStats = LandingPageKpis & {
  date: string
}

type ShortUrlUtmDefaults = {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
}

type LandingPagesAnalyticsResponse = {
  data: {
    summary: {
      totalLandingPages: number
      activeLandingPages: number
      totalShortUrls: number
      activeShortUrls: number
      uniqueVisitors: number
      totalVisits: number
      signupClicks: number
      signups: number
      patreonSales: number
      totalPurchases: number
      firstPurchaseRevenueCents: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      currentSubscribers: number
      clickThroughRate: number
      signupConversionRate: number
      patreonSaleRate: number
    }
    subscriptionEarningsChart: {
      tiers: Array<{
        tierCode: string
        tierLabel: string
      }>
      daily: Array<{
        periodKey: string
        totalRevenueCents: number
        currentMonthlySubscriptionEarningCents: number
        currentSubscribers: number
        tiers: Array<{
          tierCode: string
          tierLabel: string
          totalRevenueCents: number
          currentMonthlySubscriptionEarningCents: number
          currentSubscribers: number
        }>
      }>
      monthly: Array<{
        periodKey: string
        totalRevenueCents: number
        currentMonthlySubscriptionEarningCents: number
        currentSubscribers: number
        tiers: Array<{
          tierCode: string
          tierLabel: string
          totalRevenueCents: number
          currentMonthlySubscriptionEarningCents: number
          currentSubscribers: number
        }>
      }>
    }
    landingPages: Array<{
      id: string
      key: string
      name: string
      description: string | null
      basePath: string | null
      isActive: boolean
      createdAt: string
      updatedAt: string
      kpis: LandingPageKpis & {
        currentMonthlySubscriptionEarningCents: number
        currentSubscribers: number
      }
      sources: Array<{
        source: string
        signupClicks: number
      }>
    }>
    shortUrls: Array<{
      id: string
      key: string
      name: string
      description: string | null
      utmSource: string | null
      utmMedium: string | null
      utmCampaign: string | null
      utmContent: string | null
      utmTerm: string | null
      isActive: boolean
      createdAt: string
      updatedAt: string
      totalClicks: number
      totalSignups: number
      totalRevenueCents: number
      kpis: LandingPageKpis
      targets: Array<{
        id: string
        landingPageId: string
        landingPageKey: string
        landingPageName: string
        basePath: string | null
        isActive: boolean
        weight: number
        totalClicks: number
        totalSignups: number
        totalRevenueCents: number
        kpis: LandingPageKpis
      }>
    }>
  }
}

type LandingPageTrackingIssuesResponse = {
  data: Array<{
    id: string
    fingerprint: string
    kind: string
    landingPageKey: string | null
    variantKey: string | null
    routePath: string | null
    shortUrlKey: string | null
    firstSeenAt: string
    lastSeenAt: string
    seenCount: number
  }>
}

type LandingPagesTrafficReportResponse = {
  data: {
    summary: {
      attributedUsers: number
      signedUpUsers: number
      purchasingUsers: number
      totalPurchases: number
      firstPurchaseRevenueCents: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      currentSubscribers: number
    }
    landingPages: Array<{
      id: string
      key: string
      name: string
      basePath: string | null
      isActive: boolean
      dailyStats: LandingPageDailyStats[]
    }>
    shortUrls: Array<{
      id: string
      key: string
      name: string
      utmSource: string | null
      utmMedium: string | null
      utmCampaign: string | null
      utmContent: string | null
      utmTerm: string | null
      isActive: boolean
      dailyStats: LandingPageDailyStats[]
    }>
    sources: Array<{
      landingPageId: string
      landingPageKey: string
      landingPageName: string
      source: string
      medium: string | null
      campaign: string | null
      content: string | null
      term: string | null
      shortUrlKey: string | null
      uniqueVisitors: number
      uniqueUsers: number
      totalVisits: number
      signupClicks: number
      signups: number
      patreonSales: number
      totalPurchases: number
      firstPurchaseRevenueCents: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      currentSubscribers: number
      dailyStats: LandingPageDailyStats[]
      clickThroughRate: number
      signupConversionRate: number
      patreonSaleRate: number
    }>
    users: Array<{
      userId: string
      email: string
      username: string
      landingPageId: string
      landingPageKey: string
      landingPageName: string
      basePath: string | null
      source: string
      medium: string | null
      campaign: string | null
      content: string | null
      term: string | null
      shortUrlKey: string | null
      shortUrlName: string | null
      signedUpAt: string
      firstPurchaseAt: string | null
      firstPurchaseAmountCents: number
      lastPurchaseAt: string | null
      totalPurchases: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      membershipStatus: string
      currentTierCents: number
      purchaseHistory: Array<{
        id: string
        kind: string
        tierCode: string
        amountCents: number
        chargedAt: string
      }>
    }>
  }
}

type LandingPagesPerformanceReportResponse = {
  data: {
    summary: {
      totalLandingPages: number
      activeLandingPages: number
      totalShortUrls: number
      activeShortUrls: number
      uniqueVisitors: number
      totalVisits: number
      signupClicks: number
      signups: number
      patreonSales: number
      totalPurchases: number
      firstPurchaseRevenueCents: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      currentSubscribers: number
      clickThroughRate: number
      signupConversionRate: number
      patreonSaleRate: number
    }
    landingPages: Array<{
      id: string
      key: string
      name: string
      description: string | null
      basePath: string | null
      isActive: boolean
      createdAt: string
      updatedAt: string
      kpis: LandingPageKpis
      dailyStats: LandingPageDailyStats[]
    }>
    shortUrls: Array<{
      id: string
      key: string
      name: string
      description: string | null
      utmSource: string | null
      utmMedium: string | null
      utmCampaign: string | null
      utmContent: string | null
      utmTerm: string | null
      isActive: boolean
      createdAt: string
      updatedAt: string
      kpis: LandingPageKpis
      dailyStats: LandingPageDailyStats[]
    }>
  }
}

type LandingPageOptionsResponse = {
  data: Array<{
    id: string
    key: string
    name: string
    basePath: string | null
    isActive: boolean
    variants: Array<{
      id: string
      key: string
      name: string
      routePath: string
    }>
  }>
}

type DefaultHomepageResponse = {
  data: {
    landingPage: {
      id: string
      key: string
      name: string
      basePath: string | null
      isActive: boolean
    } | null
    fallbackKey: string
    fallbackPath: string
  }
}

type CreateLandingPagePayload = {
  key: string
  name: string
  description?: string
  basePath: string
  initialVariant?: {
    key: string
    name: string
    routePath: string
    notes?: string
    isControl?: boolean
  }
}

type CreateLandingPageVariantPayload = {
  landingPageId: string
  key: string
  name: string
  routePath: string
  notes?: string
  weight?: number
  isControl?: boolean
}

type CreateLandingPageShortUrlPayload = {
  key: string
  name: string
  description?: string
  isActive?: boolean
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  targets: Array<{
    landingPageId: string
    weight?: number
  }>
}

type UpdateLandingPagePayload = {
  key?: string
  name?: string
  description?: string | null
  basePath?: string | null
  isActive?: boolean
}

type UpdateLandingPageVariantPayload = {
  key?: string
  name?: string
  routePath?: string
  notes?: string | null
  weight?: number
  isControl?: boolean
  isActive?: boolean
}

type UpdateLandingPageShortUrlPayload = {
  key?: string
  name?: string
  description?: string | null
  isActive?: boolean
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  targets?: Array<{
    landingPageId: string
    weight?: number
  }>
}

const trackLandingVisit = async (payload: TrackLandingVisitPayload) => {
  const googleAnalyticsContext = await readGoogleAnalyticsClientContext()
  const response = await apiPost<{
    data:
      | { tracked: true; visitorId: string; visitId: string; landingPageKey: string; variantKey: string; shortUrlKey: string | null }
      | { tracked: false }
  }>('/landing-pages/track-visit', {
    ...payload,
    gaClientId: payload.gaClientId ?? googleAnalyticsContext.clientId,
    gaSessionId: payload.gaSessionId ?? googleAnalyticsContext.sessionId
  })

  trackLandingPageVisitEvent({
    landingPageKey: response.data.tracked ? response.data.landingPageKey : payload.landingPageKey,
    variantKey: response.data.tracked ? response.data.variantKey : payload.variantKey,
    shortUrlKey: response.data.tracked ? response.data.shortUrlKey : payload.shortUrlKey,
    routePath: payload.routePath,
    source: payload.source,
    medium: payload.medium,
    campaign: payload.campaign,
    content: payload.content,
    term: payload.term,
    tracked: response.data.tracked
  })

  return response
}

const trackLandingSignupClick = async () => {
  const response = await apiPost<{ data: { tracked: boolean; visitId: string | null } }>('/landing-pages/track-signup-click', {})
  trackLandingSignupClickEvent()
  return response
}

const getLandingPagesAnalytics = async () => {
  return apiGet<LandingPagesAnalyticsResponse>('/stats/landing-pages')
}

const getLandingPagesTrafficReport = async () => {
  return apiGet<LandingPagesTrafficReportResponse>('/stats/landing-pages/traffic')
}

const getLandingPagesPerformanceReport = async () => {
  return apiGet<LandingPagesPerformanceReportResponse>('/stats/landing-pages/performance')
}

const getLandingPageOptions = async () => {
  return apiGet<LandingPageOptionsResponse>('/admin/landing-pages/options')
}

const getDefaultHomepage = async () => {
  return apiGet<DefaultHomepageResponse>('/landing-pages/default-homepage', {
    cache: 'no-store'
  })
}

const getAdminDefaultHomepage = async () => {
  return apiGet<DefaultHomepageResponse>('/admin/landing-pages/default-homepage')
}

const updateDefaultHomepage = async (landingPageId: string | null) => {
  return apiPatch<DefaultHomepageResponse>('/admin/landing-pages/default-homepage', {
    landingPageId: landingPageId === null ? null : landingPageId.trim()
  })
}

const getLandingPageTrackingIssues = async () => {
  return apiGet<LandingPageTrackingIssuesResponse>('/admin/landing-pages/tracking-issues')
}

const createLandingPage = async (payload: CreateLandingPagePayload) => {
  return apiPost<{ data: { id: string } }>('/admin/landing-pages', payload)
}

const createLandingPageVariant = async (payload: CreateLandingPageVariantPayload) => {
  return apiPost<{ data: { id: string } }>('/admin/landing-page-variants', payload)
}

const createLandingPageShortUrl = async (payload: CreateLandingPageShortUrlPayload) => {
  return apiPost<{ data: { id: string } }>('/admin/landing-page-short-urls', payload)
}

const updateLandingPage = async (landingPageId: string, payload: UpdateLandingPagePayload) => {
  return apiPatch<{ data: { id: string } }>(`/admin/landing-pages/${landingPageId}`, payload)
}

const updateLandingPageVariant = async (variantId: string, payload: UpdateLandingPageVariantPayload) => {
  return apiPatch<{ data: { id: string } }>(`/admin/landing-page-variants/${variantId}`, payload)
}

const updateLandingPageShortUrl = async (shortUrlId: string, payload: UpdateLandingPageShortUrlPayload) => {
  return apiPatch<{ data: { id: string } }>(`/admin/landing-page-short-urls/${shortUrlId}`, payload)
}

export {
  createLandingPage,
  createLandingPageShortUrl,
  createLandingPageVariant,
  getLandingPageOptions,
  getLandingPageTrackingIssues,
  getLandingPagesAnalytics,
  getLandingPagesPerformanceReport,
  getLandingPagesTrafficReport,
  getAdminDefaultHomepage,
  getDefaultHomepage,
  trackLandingSignupClick,
  trackLandingVisit,
  updateDefaultHomepage,
  updateLandingPage,
  updateLandingPageShortUrl,
  updateLandingPageVariant
}
export type {
  CreateLandingPagePayload,
  CreateLandingPageShortUrlPayload,
  CreateLandingPageVariantPayload,
  DefaultHomepageResponse,
  LandingPageOptionsResponse,
  LandingPageTrackingIssuesResponse,
  LandingPagesAnalyticsResponse,
  LandingPagesPerformanceReportResponse,
  LandingPagesTrafficReportResponse,
  ShortUrlUtmDefaults,
  TrackLandingVisitPayload,
  UpdateLandingPagePayload,
  UpdateLandingPageShortUrlPayload,
  UpdateLandingPageVariantPayload
}
