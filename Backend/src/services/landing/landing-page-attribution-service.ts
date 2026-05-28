import { RevenueEventKind } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import {
  sendGoogleAnalyticsPurchaseEvent,
  type GoogleAnalyticsRevenueAttribution,
  type GoogleAnalyticsRevenueEvent
} from '../../lib/google-analytics-measurement-protocol'
import { redactLogText } from '../../lib/log-redaction'
import { prisma } from '../../lib/prisma'
import {
  normalizeLandingPageKey,
  normalizeLandingPageOptionalText,
  normalizeLandingPagePath,
  toLandingPageReferrerHost
} from './landing-page-paths'
import {
  recordLandingPageTrackingIssue,
  type NormalizedLandingPageTrackingIssue
} from './landing-page-tracking-issue-service'

const LANDING_VISITOR_COOKIE_NAME = 'sw_lp_vid'
const LANDING_VISITOR_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180

/**
 * Public tracking payload accepted by `/landing-pages/track-visit`.
 *
 * `landingPageName` and `variantName` are accepted as context from callers but
 * are not authoritative. Public traffic must never rewrite admin-owned catalog
 * names, paths, active flags, or control flags.
 */
type LandingVisitTrackingInput = {
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
  userAgent?: string | null
  gaClientId?: string | null
  gaSessionId?: string | null
}

/**
 * Immutable attribution snapshot used after signup and Patreon conversion.
 * It is read from persisted visits, not from the current public request body.
 */
type LandingAttributionSnapshot = {
  visitId: string
  landingPageId: string
  landingPageKey: string
  landingPageName: string
  variantId: string
  variantKey: string
  variantName: string
  shortUrlKey: string | null
  routePath: string
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  referrerHost: string | null
  firstVisitedAt: Date
  lastVisitedAt: Date
  gaClientId: string | null
  gaSessionId: string | null
}

/**
 * Minimal landing-page catalog projection required by visit tracking.
 * The shape deliberately excludes admin-editable fields that public tracking
 * must not write, such as `basePath` and `description`.
 */
type LandingPageCatalogRow = {
  id: string
  key: string
  name: string
  isActive: boolean
}

/**
 * Minimal variant projection required to attach a visit to configured catalog
 * data. Tracking may reference this row, but it may not repair this row from
 * public payload values.
 */
type LandingPageVariantCatalogRow = {
  id: string
  landingPageId: string
  key: string
  name: string
  routePath: string
  isActive: boolean
  landingPage: {
    key: string
    name: string
  }
}

type LandingPageShortUrlRow = {
  id: string
  key: string
  isActive: boolean
}

/**
 * Narrow database port for public visit tracking.
 * Deliberately excludes landing-page and variant mutation APIs so tests can
 * prove the service cannot create or rewrite admin-owned catalog rows.
 */
type LandingPageVisitTrackingDatabase = {
  landingPage: {
    findUnique: (input: unknown) => Promise<LandingPageCatalogRow | null>
  }
  landingPageVariant: {
    findUnique: (input: unknown) => Promise<LandingPageVariantCatalogRow | null>
    findMany: (input: unknown) => Promise<LandingPageVariantCatalogRow[]>
  }
  landingPageShortUrl: {
    findUnique: (input: unknown) => Promise<LandingPageShortUrlRow | null>
  }
  landingPageVisit: {
    upsert: (input: unknown) => Promise<{ id: string }>
  }
}

type LandingVisitTrackingResult =
  | {
      tracked: true
      visitorId: string
      visitId: string
      landingPageKey: string
      variantKey: string
      shortUrlKey: string | null
    }
  | {
      tracked: false
    }

type LandingVisitTrackingOptions = {
  db?: LandingPageVisitTrackingDatabase
  now?: Date
  recordTrackingIssue?: (issue: NormalizedLandingPageTrackingIssue) => Promise<unknown>
}

type RevenueEventRecordInput = {
  userId: string
  providerEventKey: string
  kind: RevenueEventKind
  tierCode: string
  amountCents: number
  billingPeriodMonths?: number
  chargedAt: Date
}

type RevenuePurchaseAnalyticsEmitter = (input: {
  revenueEvent: GoogleAnalyticsRevenueEvent
  attribution: GoogleAnalyticsRevenueAttribution | null
}) => Promise<unknown>

type RevenueEventRecordOptions = {
  emitPurchaseAnalytics?: RevenuePurchaseAnalyticsEmitter
}

const normalizeGoogleAnalyticsIdentifier = (value: string | null | undefined) => {
  const normalized = normalizeLandingPageOptionalText(value, 128)
  return normalized && /^[a-zA-Z0-9._:-]{1,128}$/.test(normalized) ? normalized : null
}

/**
 * Ensures a stable anonymous visitor id for landing attribution.
 * Setting this cookie is the only public-response mutation owned by tracking.
 */
const ensureVisitorId = (request: Request, response?: Response) => {
  const existingCookie = normalizeLandingPageOptionalText(request.cookies?.[LANDING_VISITOR_COOKIE_NAME], 128)

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

/**
 * Records public visit attribution against the existing admin-owned catalog.
 * Public payload fields are lookup/telemetry inputs only; this service must not
 * create or mutate LandingPage or LandingPageVariant configuration.
 */
const trackLandingPageVisit = async (
  request: Request,
  response: Response,
  input: LandingVisitTrackingInput,
  options?: LandingVisitTrackingOptions
): Promise<LandingVisitTrackingResult> => {
  const db = options?.db ?? (prisma as unknown as LandingPageVisitTrackingDatabase)
  const now = options?.now ?? new Date()
  const visitorId = ensureVisitorId(request, response)
  const landingPageKey = normalizeLandingPageKey(input.landingPageKey, 'landing-page')
  const routePath = normalizeLandingPagePath(input.routePath)
  const variantKey = normalizeLandingPageKey(input.variantKey, landingPageKey)
  const shortUrlKey = normalizeLandingPageKey(input.shortUrlKey, '')
  const recordIssue =
    options?.recordTrackingIssue ?? ((issue: NormalizedLandingPageTrackingIssue) => recordLandingPageTrackingIssue(issue))
  const buildIssue = (kind: NormalizedLandingPageTrackingIssue['kind']): NormalizedLandingPageTrackingIssue => ({
    kind,
    landingPageKey,
    variantKey,
    routePath,
    shortUrlKey: shortUrlKey || null
  })

  const landingPage = await db.landingPage.findUnique({
    where: {
      key: landingPageKey
    },
    select: {
      id: true,
      key: true,
      name: true,
      isActive: true
    }
  })

  if (!landingPage) {
    await recordIssue(buildIssue('UNKNOWN_LANDING_PAGE'))
    return {
      tracked: false
    }
  }

  if (!landingPage.isActive) {
    await recordIssue(buildIssue('INACTIVE_LANDING_PAGE'))
    return {
      tracked: false
    }
  }

  let variant = await db.landingPageVariant.findUnique({
    where: {
      landingPageId_key: {
        landingPageId: landingPage.id,
        key: variantKey
      }
    },
    include: {
      landingPage: true
    }
  })

  if (!variant?.isActive) {
    await recordIssue(buildIssue('UNKNOWN_VARIANT'))

    // A single active control variant is the only safe automatic fallback:
    // it is admin-configured, deterministic, and cannot invent catalog state.
    const controlVariants = await db.landingPageVariant.findMany({
      where: {
        landingPageId: landingPage.id,
        isActive: true,
        isControl: true
      },
      include: {
        landingPage: true
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 2
    })

    if (controlVariants.length !== 1) {
      await recordIssue(buildIssue('MISSING_CONTROL_VARIANT'))
      return {
        tracked: false
      }
    }

    variant = controlVariants[0]
  }

  const shortUrl = shortUrlKey
    ? await db.landingPageShortUrl.findUnique({
        where: {
          key: shortUrlKey
        },
        select: {
          id: true,
          key: true,
          isActive: true
        }
      })
    : null
  const attributionKey = shortUrl?.isActive ? `${variant.id}:short:${shortUrl.id}` : `${variant.id}:direct`

  const source = normalizeLandingPageOptionalText(input.source)
  const medium = normalizeLandingPageOptionalText(input.medium)
  const campaign = normalizeLandingPageOptionalText(input.campaign)
  const content = normalizeLandingPageOptionalText(input.content)
  const term = normalizeLandingPageOptionalText(input.term)
  const referrerHost = toLandingPageReferrerHost(input.referrer)
  const landingUrl = normalizeLandingPageOptionalText(input.landingUrl, 1000)
  const userAgent = normalizeLandingPageOptionalText(input.userAgent, 500)
  const gaClientId = normalizeGoogleAnalyticsIdentifier(input.gaClientId)
  const gaSessionId = normalizeGoogleAnalyticsIdentifier(input.gaSessionId)

  const visit = await db.landingPageVisit.upsert({
    where: {
      visitorId_attributionKey: {
        visitorId,
        attributionKey
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
      shortUrlId: shortUrl?.isActive ? shortUrl.id : null,
      attributionKey,
      referrerHost: referrerHost ?? undefined,
      entryPath: routePath,
      landingUrl: landingUrl ?? undefined,
      userAgent: userAgent ?? undefined,
      gaClientId: gaClientId ?? undefined,
      gaSessionId: gaSessionId ?? undefined
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
      attributionKey,
      shortUrlId: shortUrl?.isActive ? shortUrl.id : null,
      referrerHost,
      entryPath: routePath,
      landingUrl,
      userAgent,
      gaClientId,
      gaSessionId,
      firstVisitedAt: now,
      lastVisitedAt: now
    }
  })

  return {
    tracked: true,
    visitorId,
    visitId: visit.id,
    landingPageKey: variant.landingPage.key,
    variantKey: variant.key,
    shortUrlKey: shortUrl?.isActive ? shortUrl.key : null
  }
}

/**
 * Marks the latest attributed visit when a visitor clicks toward signup.
 * Missing or stale attribution is not an error for the public endpoint.
 */
const trackLandingPageSignupClick = async (request: Request) => {
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

/**
 * Resolves the latest persisted attribution for the visitor cookie.
 * Public request payload is not consulted here, so signup/revenue attribution
 * cannot be spoofed by changing query parameters after the visit was recorded.
 */
const getLatestLandingAttributionForRequest = async (request: Request): Promise<LandingAttributionSnapshot | null> => {
  const visitorId = normalizeLandingPageOptionalText(request.cookies?.[LANDING_VISITOR_COOKIE_NAME], 128)

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
      variant: true,
      shortUrl: {
        select: {
          key: true
        }
      }
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
    shortUrlKey: visit.shortUrl?.key ?? null,
    routePath: visit.variant.routePath,
    source: visit.source,
    medium: visit.medium,
    campaign: visit.campaign,
    content: visit.content,
    term: visit.term,
    referrerHost: visit.referrerHost,
    firstVisitedAt: visit.firstVisitedAt,
    lastVisitedAt: visit.lastVisitedAt,
    gaClientId: visit.gaClientId,
    gaSessionId: visit.gaSessionId
  }
}

/**
 * Creates or enriches a provider revenue event with the user's acquisition
 * visit. Provider event keys remain the idempotency boundary for revenue.
 */
const toRevenueAnalyticsAttribution = (
  visit:
    | {
        source: string | null
        medium: string | null
        campaign: string | null
        content: string | null
        term: string | null
        gaClientId: string | null
        gaSessionId: string | null
        landingPage: {
          key: string
        }
        variant: {
          key: string
          routePath: string
        }
        shortUrl: {
          key: string
        } | null
      }
    | null
    | undefined
): GoogleAnalyticsRevenueAttribution | null => {
  if (!visit) {
    return null
  }

  return {
    landingPageKey: visit.landingPage.key,
    variantKey: visit.variant.key,
    routePath: visit.variant.routePath,
    shortUrlKey: visit.shortUrl?.key ?? null,
    source: visit.source,
    medium: visit.medium,
    campaign: visit.campaign,
    content: visit.content,
    term: visit.term,
    gaClientId: visit.gaClientId,
    gaSessionId: visit.gaSessionId
  }
}

const emitRevenuePurchaseAnalytics = async (
  emitPurchaseAnalytics: RevenuePurchaseAnalyticsEmitter,
  input: {
    revenueEvent: GoogleAnalyticsRevenueEvent
    attribution: GoogleAnalyticsRevenueAttribution | null
  }
) => {
  try {
    await emitPurchaseAnalytics(input)
  } catch (error) {
    console.warn('[analytics] Purchase analytics emitter failed after revenue was persisted.', {
      revenueEventId: input.revenueEvent.id,
      error: redactLogText(error instanceof Error ? error.message : String(error))
    })
  }
}

const recordRevenueEventForUser = async (input: RevenueEventRecordInput, options?: RevenueEventRecordOptions) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      id: input.userId
    },
    select: {
      acquisitionVisitId: true,
      acquisitionVisit: {
        select: {
          source: true,
          medium: true,
          campaign: true,
          content: true,
          term: true,
          gaClientId: true,
          gaSessionId: true,
          landingPage: {
            select: {
              key: true
            }
          },
          variant: {
            select: {
              key: true,
              routePath: true
            }
          },
          shortUrl: {
            select: {
              key: true
            }
          }
        }
      }
    }
  })

  if (!existingUser) {
    return null
  }

  const existingRevenueEvent = await prisma.revenueEvent.findUnique({
    where: {
      providerEventKey: input.providerEventKey
    }
  })

  if (existingRevenueEvent) {
    if (!existingRevenueEvent.acquisitionVisitId && existingUser.acquisitionVisitId) {
      return prisma.revenueEvent.update({
        where: {
          id: existingRevenueEvent.id
        },
        data: {
          acquisitionVisitId: existingUser.acquisitionVisitId
        }
      })
    }

    return existingRevenueEvent
  }

  const revenueEvent = await prisma.revenueEvent.create({
    data: {
      userId: input.userId,
      acquisitionVisitId: existingUser.acquisitionVisitId ?? null,
      kind: input.kind,
      providerEventKey: input.providerEventKey,
      tierCode: input.tierCode,
      amountCents: input.amountCents,
      billingPeriodMonths: input.billingPeriodMonths ?? 1,
      chargedAt: input.chargedAt
    }
  })

  await emitRevenuePurchaseAnalytics(options?.emitPurchaseAnalytics ?? sendGoogleAnalyticsPurchaseEvent, {
    revenueEvent: {
      id: revenueEvent.id,
      userId: revenueEvent.userId,
      provider: revenueEvent.provider,
      kind: revenueEvent.kind,
      tierCode: revenueEvent.tierCode,
      amountCents: revenueEvent.amountCents,
      billingPeriodMonths: revenueEvent.billingPeriodMonths,
      chargedAt: revenueEvent.chargedAt
    },
    attribution: toRevenueAnalyticsAttribution(existingUser.acquisitionVisit)
  })

  return revenueEvent
}

/**
 * Marks Patreon conversion timestamps without touching acquisition ownership.
 * These timestamps are user-conversion facts; revenue rows remain the monetary
 * attribution source.
 */
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
  ensureVisitorId,
  getLatestLandingAttributionForRequest,
  markPatreonConversionForUser,
  recordRevenueEventForUser,
  trackLandingPageSignupClick,
  trackLandingPageVisit
}
export type {
  LandingAttributionSnapshot,
  LandingPageVisitTrackingDatabase,
  LandingVisitTrackingInput,
  LandingVisitTrackingOptions,
  LandingVisitTrackingResult,
  RevenueEventRecordInput,
  RevenueEventRecordOptions,
  RevenuePurchaseAnalyticsEmitter
}
