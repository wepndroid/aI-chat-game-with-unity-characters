import { apiGet, apiPatch, apiPost } from '@/lib/api-client'

type TrackLandingVisitPayload = {
  landingPageKey: string
  landingPageName?: string
  variantKey?: string
  variantName?: string
  routePath: string
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
  term?: string | null
  landingUrl?: string | null
  referrer?: string | null
}

type LandingPagesAnalyticsResponse = {
  data: {
    summary: {
      totalLandingPages: number
      activeVariants: number
      uniqueVisitors: number
      totalVisits: number
      signupClicks: number
      signups: number
      patreonLinks: number
      patreonSales: number
      activeAttributedPatrons: number
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
      kpis: {
        uniqueVisitors: number
        totalVisits: number
        signupClicks: number
        signups: number
        patreonLinks: number
        patreonSales: number
        clickThroughRate: number
        signupConversionRate: number
        patreonLinkRate: number
        patreonSaleRate: number
      }
      dailyStats: Array<{
        date: string
        uniqueVisitors: number
        totalVisits: number
        signupClicks: number
        signups: number
        patreonSales: number
        clickThroughRate: number
        signupConversionRate: number
        patreonSaleRate: number
      }>
      sources: Array<{
        source: string
        uniqueVisitors: number
        totalVisits: number
        signupClicks: number
        signups: number
        patreonSales: number
        clickThroughRate: number
        signupConversionRate: number
        patreonSaleRate: number
      }>
      variants: Array<{
        id: string
        key: string
        name: string
        routePath: string
        notes: string | null
        isControl: boolean
        isActive: boolean
        weight: number
        uniqueVisitors: number
        totalVisits: number
        signupClicks: number
        signups: number
        patreonLinks: number
        patreonSales: number
        clickThroughRate: number
        signupConversionRate: number
        patreonLinkRate: number
        patreonSaleRate: number
        dailyStats: Array<{
          date: string
          uniqueVisitors: number
          totalVisits: number
          signupClicks: number
          signups: number
          patreonSales: number
          clickThroughRate: number
          signupConversionRate: number
          patreonSaleRate: number
        }>
      }>
    }>
  }
}

type LandingPageOptionsResponse = {
  data: Array<{
    id: string
    key: string
    name: string
    basePath: string | null
    variants: Array<{
      id: string
      key: string
      name: string
      routePath: string
    }>
  }>
}

type CreateLandingPagePayload = {
  key: string
  name: string
  description?: string
  basePath: string
  initialVariant: {
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

const trackLandingVisit = async (payload: TrackLandingVisitPayload) => {
  return apiPost<{ data: { visitorId: string; visitId: string; landingPageKey: string; variantKey: string } }>(
    '/landing-pages/track-visit',
    payload
  )
}

const trackLandingSignupClick = async () => {
  return apiPost<{ data: { tracked: boolean; visitId: string | null } }>('/landing-pages/track-signup-click', {})
}

const getLandingPagesAnalytics = async () => {
  return apiGet<LandingPagesAnalyticsResponse>('/stats/landing-pages')
}

const getLandingPageOptions = async () => {
  return apiGet<LandingPageOptionsResponse>('/admin/landing-pages/options')
}

const createLandingPage = async (payload: CreateLandingPagePayload) => {
  return apiPost<{ data: { id: string } }>('/admin/landing-pages', payload)
}

const createLandingPageVariant = async (payload: CreateLandingPageVariantPayload) => {
  return apiPost<{ data: { id: string } }>('/admin/landing-page-variants', payload)
}

const updateLandingPage = async (landingPageId: string, payload: UpdateLandingPagePayload) => {
  return apiPatch<{ data: { id: string } }>(`/admin/landing-pages/${landingPageId}`, payload)
}

const updateLandingPageVariant = async (variantId: string, payload: UpdateLandingPageVariantPayload) => {
  return apiPatch<{ data: { id: string } }>(`/admin/landing-page-variants/${variantId}`, payload)
}

export {
  createLandingPage,
  createLandingPageVariant,
  getLandingPageOptions,
  getLandingPagesAnalytics,
  trackLandingSignupClick,
  trackLandingVisit,
  updateLandingPage,
  updateLandingPageVariant
}
export type {
  CreateLandingPagePayload,
  CreateLandingPageVariantPayload,
  LandingPageOptionsResponse,
  LandingPagesAnalyticsResponse,
  TrackLandingVisitPayload,
  UpdateLandingPagePayload,
  UpdateLandingPageVariantPayload
}
