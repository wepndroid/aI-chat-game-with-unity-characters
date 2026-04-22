import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { ensureLandingPageSignupClickColumn } from './landing-page-visit-compat'
import { prisma } from './prisma'

const LANDING_VISITOR_COOKIE_NAME = 'sw_lp_vid'
const LANDING_VISITOR_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180

type LandingVisitTrackingInput = {
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
  userAgent?: string | null
}

type LandingAttributionSnapshot = {
  visitId: string
  landingPageId: string
  landingPageKey: string
  landingPageName: string
  variantId: string
  variantKey: string
  variantName: string
  routePath: string
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  referrerHost: string | null
  firstVisitedAt: Date
  lastVisitedAt: Date
}

const normalizeOptionalText = (value: string | null | undefined, maxLength = 191) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, maxLength)
}

const normalizePath = (value: string | null | undefined) => {
  const normalized = normalizeOptionalText(value, 255)

  if (!normalized) {
    return '/'
  }

  if (normalized.startsWith('/')) {
    return normalized
  }

  return `/${normalized}`
}

const normalizeKey = (value: string | null | undefined, fallback: string) => {
  const normalized = normalizeOptionalText(value, 80)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

const toDisplayName = (value: string | null | undefined, fallback: string) => {
  return normalizeOptionalText(value, 120) ?? fallback
}

const toReferrerHost = (value: string | null | undefined) => {
  const normalized = normalizeOptionalText(value, 1000)

  if (!normalized) {
    return null
  }

  try {
    return new URL(normalized).host.slice(0, 191) || null
  } catch {
    return null
  }
}

const ensureVisitorId = (request: Request, response?: Response) => {
  const existingCookie = normalizeOptionalText(request.cookies?.[LANDING_VISITOR_COOKIE_NAME], 128)

  if (existingCookie) {
    return existingCookie
  }

  const nextVisitorId = randomUUID()

  if (response) {
    response.cookie(LANDING_VISITOR_COOKIE_NAME, nextVisitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: LANDING_VISITOR_COOKIE_MAX_AGE_MS
    })
  }

  return nextVisitorId
}

const trackLandingPageVisit = async (request: Request, response: Response, input: LandingVisitTrackingInput) => {
  await ensureLandingPageSignupClickColumn()

  const visitorId = ensureVisitorId(request, response)
  const landingPageKey = normalizeKey(input.landingPageKey, 'landing-page')
  const routePath = normalizePath(input.routePath)
  const variantKey = normalizeKey(input.variantKey, landingPageKey)
  const landingPageName = toDisplayName(input.landingPageName, landingPageKey.toUpperCase())
  const variantName = toDisplayName(input.variantName, variantKey.toUpperCase())
  const now = new Date()

  const upsertedLandingPage = await prisma.landingPage.upsert({
    where: {
      key: landingPageKey
    },
    update: {
      name: landingPageName,
      basePath: routePath
    },
    create: {
      key: landingPageKey,
      name: landingPageName,
      basePath: routePath
    }
  })

  const variant = await prisma.landingPageVariant.upsert({
    where: {
      routePath
    },
    update: {
      landingPageId: upsertedLandingPage.id,
      key: variantKey,
      name: variantName,
      isActive: true
    },
    create: {
      landingPageId: upsertedLandingPage.id,
      key: variantKey,
      name: variantName,
      routePath,
      isControl: variantKey === landingPageKey
    },
    include: {
      landingPage: true
    }
  })

  const source = normalizeOptionalText(input.source)
  const medium = normalizeOptionalText(input.medium)
  const campaign = normalizeOptionalText(input.campaign)
  const content = normalizeOptionalText(input.content)
  const term = normalizeOptionalText(input.term)
  const referrerHost = toReferrerHost(input.referrer)
  const landingUrl = normalizeOptionalText(input.landingUrl, 1000)
  const userAgent = normalizeOptionalText(input.userAgent, 500)

  const visit = await prisma.landingPageVisit.upsert({
    where: {
      visitorId_variantId: {
        visitorId,
        variantId: variant.id
      }
    },
    update: {
      visitCount: {
        increment: 1
      },
      lastVisitedAt: now,
      source: source ?? undefined,
      medium: medium ?? undefined,
      campaign: campaign ?? undefined,
      content: content ?? undefined,
      term: term ?? undefined,
      referrerHost: referrerHost ?? undefined,
      entryPath: routePath,
      landingUrl: landingUrl ?? undefined,
      userAgent: userAgent ?? undefined
    },
    create: {
      landingPageId: variant.landingPageId,
      variantId: variant.id,
      visitorId,
      source,
      medium,
      campaign,
      content,
      term,
      referrerHost,
      entryPath: routePath,
      landingUrl,
      userAgent,
      firstVisitedAt: now,
      lastVisitedAt: now
    }
  })

  return {
    visitorId,
    visitId: visit.id,
    landingPageKey: variant.landingPage.key,
    variantKey: variant.key
  }
}

const trackLandingPageSignupClick = async (request: Request) => {
  await ensureLandingPageSignupClickColumn()

  const attribution = await getLatestLandingAttributionForRequest(request)

  if (!attribution) {
    return {
      tracked: false,
      visitId: null
    }
  }

  const existingVisit = await prisma.landingPageVisit.findUnique({
    where: {
      id: attribution.visitId
    },
    select: {
      id: true,
      signupClickedAt: true
    }
  })

  if (!existingVisit) {
    return {
      tracked: false,
      visitId: null
    }
  }

  if (!existingVisit.signupClickedAt) {
    await prisma.landingPageVisit.update({
      where: {
        id: existingVisit.id
      },
      data: {
        signupClickedAt: new Date()
      }
    })
  }

  return {
    tracked: true,
    visitId: existingVisit.id
  }
}

const getLatestLandingAttributionForRequest = async (request: Request): Promise<LandingAttributionSnapshot | null> => {
  await ensureLandingPageSignupClickColumn()

  const visitorId = normalizeOptionalText(request.cookies?.[LANDING_VISITOR_COOKIE_NAME], 128)

  if (!visitorId) {
    return null
  }

  const visit = await prisma.landingPageVisit.findFirst({
    where: {
      visitorId
    },
    orderBy: [
      {
        lastVisitedAt: 'desc'
      },
      {
        firstVisitedAt: 'desc'
      }
    ],
    include: {
      landingPage: true,
      variant: true
    }
  })

  if (!visit) {
    return null
  }

  return {
    visitId: visit.id,
    landingPageId: visit.landingPageId,
    landingPageKey: visit.landingPage.key,
    landingPageName: visit.landingPage.name,
    variantId: visit.variantId,
    variantKey: visit.variant.key,
    variantName: visit.variant.name,
    routePath: visit.variant.routePath,
    source: visit.source,
    medium: visit.medium,
    campaign: visit.campaign,
    content: visit.content,
    term: visit.term,
    referrerHost: visit.referrerHost,
    firstVisitedAt: visit.firstVisitedAt,
    lastVisitedAt: visit.lastVisitedAt
  }
}

const attachAcquisitionToUser = async (userId: string, attribution: LandingAttributionSnapshot | null) => {
  await ensureLandingPageSignupClickColumn()

  if (!attribution) {
    return null
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      acquisitionVisitId: true
    }
  })

  if (!existingUser || existingUser.acquisitionVisitId) {
    return existingUser?.acquisitionVisitId ?? null
  }

  const now = new Date()

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: userId
      },
      data: {
        acquisitionVisitId: attribution.visitId
      }
    }),
    prisma.landingPageVisit.update({
      where: {
        id: attribution.visitId
      },
      data: {
        signedUpUserId: userId,
        signupCompletedAt: now
      }
    })
  ])

  return attribution.visitId
}

const markPatreonConversionForUser = async (userId: string, options: { linked: boolean; active: boolean }) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      patreonLinkedAt: true,
      patreonActiveAt: true
    }
  })

  if (!existingUser) {
    return
  }

  const nextUpdate: { patreonLinkedAt?: Date; patreonActiveAt?: Date } = {}
  const now = new Date()

  if (options.linked && !existingUser.patreonLinkedAt) {
    nextUpdate.patreonLinkedAt = now
  }

  if (options.active && !existingUser.patreonActiveAt) {
    nextUpdate.patreonActiveAt = now
  }

  if (Object.keys(nextUpdate).length === 0) {
    return
  }

  await prisma.user.update({
    where: {
      id: userId
    },
    data: nextUpdate
  })
}

export {
  LANDING_VISITOR_COOKIE_NAME,
  attachAcquisitionToUser,
  ensureVisitorId,
  getLatestLandingAttributionForRequest,
  markPatreonConversionForUser,
  trackLandingPageSignupClick,
  trackLandingPageVisit
}
export type { LandingAttributionSnapshot, LandingVisitTrackingInput }
