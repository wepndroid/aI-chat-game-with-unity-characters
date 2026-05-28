import { prisma } from '../../lib/prisma'
import { normalizeMembershipTierCode } from '../../lib/patreon-tier'
import { calculateMonthlyEquivalentCents, resolveBillingPeriodMonths } from '../../lib/subscription-billing'
import { buildActivePatreonEntitlementFlatQuery } from '../membership/active-patreon-entitlement-projection'
import {
  listLandingPageAdminRows,
  type LandingPageAdminRecord,
  type LandingPageAdminRowDatabase
} from './landing-page-admin-row-service'

type FindManyDelegate = {
  findMany: (query: unknown) => Promise<unknown[]>
}

type LandingPageAnalyticsDatabase = LandingPageAdminRowDatabase & {
  landingPageShortUrl: FindManyDelegate
  landingPageVisit: FindManyDelegate
  entitlement: FindManyDelegate
}

type LandingPageAnalyticsInput = {
  db?: LandingPageAnalyticsDatabase
  now?: Date
}

type PatreonAccountSnapshot = {
  membershipStatus: string | null
  tierCents: number | null
  pledgeCadenceMonths?: number | null
  lastChargeDate?: Date | null
  nextChargeDate?: Date | null
}

type ActivePatreonEntitlement = {
  userId: string
  tierCode: string
  updatedAt: Date
}

type AttributedUserSnapshot = {
  id: string
  email?: string
  username?: string
  createdAt?: Date
  patreonAccount: PatreonAccountSnapshot | null
  entitlementGrants?: Array<{
    tierCode: string
    updatedAt: Date
  }>
}

type HydratableVisit = {
  attributedUser?: AttributedUserSnapshot | null
}

type CurrentSubscriberVisit = {
  attributedUser?: {
    patreonAccount: PatreonAccountSnapshot | null
    entitlementGrants?: Array<{
      tierCode: string
      updatedAt?: Date
    }>
  } | null
}

type RevenueEventSummaryInput = {
  id?: string
  kind?: string
  tierCode?: string
  amountCents: number
  chargedAt: Date
}

type VisitKpiInput = {
  visitorId: string
  visitCount: number
  signupClickedAt: Date | null
  signupCompletedAt: Date | null
  revenueEvents: RevenueEventSummaryInput[]
} & CurrentSubscriberVisit

type DailyStatsVisit = VisitKpiInput & {
  firstVisitedAt: Date
}

type AnalyticsVisit = DailyStatsVisit & {
  id: string
  landingPageId: string
  signedUpUserId?: string | null
  source: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
  term?: string | null
  referrerHost: string | null
  shortUrl?: {
    id?: string
    key?: string
    name?: string
  } | null
  landingPage?: {
    id: string
    key: string
    name: string
    basePath: string | null
  }
  attributedUser?: AttributedUserSnapshot | null
  revenueEvents: Array<{
    id?: string
    kind?: string
    tierCode?: string
    amountCents: number
    chargedAt: Date
  }>
}

type ShortUrlOverviewRow = {
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
  createdAt: Date
  updatedAt: Date
  targets: Array<{
    id: string
    landingPageId: string
    weight: number
    landingPage: {
      id: string
      key: string
      name: string
      basePath: string | null
      isActive: boolean
    }
  }>
}

type ShortUrlTrafficRow = {
  id: string
  key: string
  name: string
  description?: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

type ShortUrlPerformanceRow = ShortUrlTrafficRow & {
  description: string | null
  createdAt: Date
  updatedAt: Date
}

const resolveDb = (db?: LandingPageAnalyticsDatabase) => db ?? (prisma as unknown as LandingPageAnalyticsDatabase)

const unique = (values: string[]) => [...new Set(values.filter((value) => value.trim().length > 0))]

const formatPercentage = (numerator: number, denominator: number) => {
  if (denominator <= 0) {
    return 0
  }

  return Math.round((numerator / denominator) * 1000) / 10
}

const formatDayKey = (value: Date) => value.toISOString().slice(0, 10)

const formatMonthKey = (value: Date) => value.toISOString().slice(0, 7)

const getSourceLabel = (visit: {
  source: string | null
  referrerHost: string | null
}) => visit.source || visit.referrerHost || 'direct'

const getRevenueSummaryForEvents = (events: RevenueEventSummaryInput[]) => {
  if (events.length === 0) {
    return {
      firstPurchaseAt: null as string | null,
      firstPurchaseAmountCents: 0,
      lastPurchaseAt: null as string | null,
      totalPurchases: 0,
      totalRevenueCents: 0
    }
  }

  const sortedEvents = [...events].sort((left, right) => left.chargedAt.getTime() - right.chargedAt.getTime())
  const firstEvent = sortedEvents[0]
  const lastEvent = sortedEvents[sortedEvents.length - 1]

  return {
    firstPurchaseAt: firstEvent.chargedAt.toISOString(),
    firstPurchaseAmountCents: firstEvent.amountCents,
    lastPurchaseAt: lastEvent.chargedAt.toISOString(),
    totalPurchases: sortedEvents.length,
    totalRevenueCents: sortedEvents.reduce((sum, event) => sum + event.amountCents, 0)
  }
}

const normalizeTierCode = (value: string | null | undefined) => {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'unknown'
}

const getTierLabel = (tierCode: string) => {
  if (tierCode === 'basic') {
    return 'Basic'
  }

  if (tierCode === 'premium') {
    return 'Premium'
  }

  if (tierCode === 'free') {
    return 'Free'
  }

  return tierCode
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Unknown'
}

const getEntitlementTierCode = (visit: CurrentSubscriberVisit) => {
  for (const entitlement of visit.attributedUser?.entitlementGrants ?? []) {
    const normalizedTierCode = normalizeMembershipTierCode(entitlement.tierCode)

    if (normalizedTierCode && normalizedTierCode !== 'free') {
      return normalizedTierCode
    }
  }

  return null
}

const getCurrentSubscriberTier = (visit: CurrentSubscriberVisit) => {
  const patreonAccount = visit.attributedUser?.patreonAccount
  const tierCents = patreonAccount?.tierCents ?? 0

  if (patreonAccount?.membershipStatus !== 'active_patron' || tierCents <= 0) {
    return null
  }

  const entitlementTierCode = getEntitlementTierCode(visit)
  if (!entitlementTierCode) {
    return null
  }

  const billingPeriodMonths = resolveBillingPeriodMonths({
    pledgeCadenceMonths: patreonAccount.pledgeCadenceMonths,
    lastChargeDate: patreonAccount.lastChargeDate,
    nextChargeDate: patreonAccount.nextChargeDate
  })
  const monthlyTierCents = calculateMonthlyEquivalentCents(tierCents, billingPeriodMonths)

  return {
    tierCode: entitlementTierCode,
    tierCents,
    monthlyTierCents,
    billingPeriodMonths
  }
}

const getCurrentSubscriptionSummary = (visits: CurrentSubscriberVisit[]) => {
  return visits.reduce(
    (summary, visit) => {
      const currentTier = getCurrentSubscriberTier(visit)

      if (!currentTier) {
        return summary
      }

      return {
        currentSubscribers: summary.currentSubscribers + 1,
        currentMonthlySubscriptionEarningCents: summary.currentMonthlySubscriptionEarningCents + currentTier.monthlyTierCents
      }
    },
    {
      currentSubscribers: 0,
      currentMonthlySubscriptionEarningCents: 0
    }
  )
}

const buildEntitlementsByUserId = (entitlements: ActivePatreonEntitlement[]) => {
  const byUserId = new Map<string, ActivePatreonEntitlement[]>()

  for (const entitlement of entitlements) {
    const userEntitlements = byUserId.get(entitlement.userId) ?? []
    userEntitlements.push(entitlement)
    byUserId.set(entitlement.userId, userEntitlements)
  }

  return byUserId
}

const attachEntitlementsToVisit = <TVisit extends HydratableVisit>(
  visit: TVisit,
  entitlementsByUserId: Map<string, ActivePatreonEntitlement[]>
) => {
  if (!visit.attributedUser) {
    return visit
  }

  return {
    ...visit,
    attributedUser: {
      ...visit.attributedUser,
      entitlementGrants: entitlementsByUserId.get(visit.attributedUser.id) ?? []
    }
  }
}

const hydrateVisitGroupsWithActiveEntitlements = async <TVisit extends HydratableVisit>(
  db: LandingPageAnalyticsDatabase,
  now: Date,
  visitGroups: TVisit[][]
) => {
  const userIds = unique(
    visitGroups.flatMap((visits) =>
      visits.flatMap((visit) => (visit.attributedUser?.id ? [visit.attributedUser.id] : []))
    )
  )

  if (userIds.length === 0) {
    return visitGroups
  }

  const entitlements = await db.entitlement.findMany(
    buildActivePatreonEntitlementFlatQuery(userIds, now)
  ) as ActivePatreonEntitlement[]
  const entitlementsByUserId = buildEntitlementsByUserId(entitlements)

  return visitGroups.map((visits) => visits.map((visit) => attachEntitlementsToVisit(visit, entitlementsByUserId)))
}

const buildVisitKpis = (visits: VisitKpiInput[]) => {
  const uniqueVisitors = new Set(visits.map((visit) => visit.visitorId)).size
  const totalVisits = visits.reduce((sum, visit) => sum + visit.visitCount, 0)
  const signupClicks = visits.filter((visit) => visit.signupClickedAt).length
  const signups = visits.filter((visit) => visit.signupCompletedAt).length
  const patreonSales = visits.filter((visit) => visit.revenueEvents.length > 0).length
  const totalPurchases = visits.reduce((sum, visit) => sum + visit.revenueEvents.length, 0)
  const firstPurchaseRevenueCents = visits.reduce(
    (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).firstPurchaseAmountCents,
    0
  )
  const totalRevenueCents = visits.reduce(
    (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).totalRevenueCents,
    0
  )
  const currentSubscriptionSummary = getCurrentSubscriptionSummary(visits)

  return {
    uniqueVisitors,
    totalVisits,
    signupClicks,
    signups,
    patreonSales,
    totalPurchases,
    firstPurchaseRevenueCents,
    totalRevenueCents,
    currentMonthlySubscriptionEarningCents: currentSubscriptionSummary.currentMonthlySubscriptionEarningCents,
    currentSubscribers: currentSubscriptionSummary.currentSubscribers,
    clickThroughRate: formatPercentage(signupClicks, uniqueVisitors),
    signupConversionRate: formatPercentage(signups, uniqueVisitors),
    patreonSaleRate: formatPercentage(patreonSales, uniqueVisitors)
  }
}

const buildSubscriptionEarningsChart = (
  visits: Array<
    CurrentSubscriberVisit & {
      firstVisitedAt: Date
      signupCompletedAt: Date | null
      revenueEvents: Array<{ tierCode?: string; amountCents: number; chargedAt: Date }>
    }
  >
) => {
  type TierBucket = {
    tierCode: string
    tierLabel: string
    totalRevenueCents: number
    currentMonthlySubscriptionEarningCents: number
    currentSubscribers: number
  }

  type PeriodBucket = {
    periodKey: string
    tiers: Map<string, TierBucket>
    totalRevenueCents: number
    currentMonthlySubscriptionEarningCents: number
    currentSubscribers: number
  }

  const dailyBuckets = new Map<string, PeriodBucket>()
  const monthlyBuckets = new Map<string, PeriodBucket>()
  const tierOptions = new Map<string, { tierCode: string; tierLabel: string }>()

  const ensurePeriod = (buckets: Map<string, PeriodBucket>, periodKey: string) => {
    const existingPeriod = buckets.get(periodKey) ?? {
      periodKey,
      tiers: new Map<string, TierBucket>(),
      totalRevenueCents: 0,
      currentMonthlySubscriptionEarningCents: 0,
      currentSubscribers: 0
    }

    buckets.set(periodKey, existingPeriod)
    return existingPeriod
  }

  const ensureTier = (period: PeriodBucket, tierCode: string) => {
    const tierLabel = getTierLabel(tierCode)
    const existingTier = period.tiers.get(tierCode) ?? {
      tierCode,
      tierLabel,
      totalRevenueCents: 0,
      currentMonthlySubscriptionEarningCents: 0,
      currentSubscribers: 0
    }

    period.tiers.set(tierCode, existingTier)
    tierOptions.set(tierCode, {
      tierCode,
      tierLabel
    })

    return existingTier
  }

  const addToPeriod = (
    buckets: Map<string, PeriodBucket>,
    periodKey: string,
    tierCode: string,
    values: {
      totalRevenueCents?: number
      currentMonthlySubscriptionEarningCents?: number
      currentSubscribers?: number
    }
  ) => {
    const period = ensurePeriod(buckets, periodKey)
    const tier = ensureTier(period, tierCode)

    period.totalRevenueCents += values.totalRevenueCents ?? 0
    period.currentMonthlySubscriptionEarningCents += values.currentMonthlySubscriptionEarningCents ?? 0
    period.currentSubscribers += values.currentSubscribers ?? 0
    tier.totalRevenueCents += values.totalRevenueCents ?? 0
    tier.currentMonthlySubscriptionEarningCents += values.currentMonthlySubscriptionEarningCents ?? 0
    tier.currentSubscribers += values.currentSubscribers ?? 0
  }

  for (const visit of visits) {
    const currentTier = getCurrentSubscriberTier(visit)

    if (currentTier) {
      const acquisitionDate = visit.signupCompletedAt ?? visit.firstVisitedAt

      addToPeriod(dailyBuckets, formatDayKey(acquisitionDate), currentTier.tierCode, {
        currentMonthlySubscriptionEarningCents: currentTier.monthlyTierCents,
        currentSubscribers: 1
      })
      addToPeriod(monthlyBuckets, formatMonthKey(acquisitionDate), currentTier.tierCode, {
        currentMonthlySubscriptionEarningCents: currentTier.monthlyTierCents,
        currentSubscribers: 1
      })
    }

    for (const revenueEvent of visit.revenueEvents) {
      const tierCode = normalizeTierCode(revenueEvent.tierCode)

      addToPeriod(dailyBuckets, formatDayKey(revenueEvent.chargedAt), tierCode, {
        totalRevenueCents: revenueEvent.amountCents
      })
      addToPeriod(monthlyBuckets, formatMonthKey(revenueEvent.chargedAt), tierCode, {
        totalRevenueCents: revenueEvent.amountCents
      })
    }
  }

  const serializePeriods = (buckets: Map<string, PeriodBucket>) =>
    [...buckets.values()]
      .sort((left, right) => left.periodKey.localeCompare(right.periodKey))
      .map((period) => ({
        periodKey: period.periodKey,
        totalRevenueCents: period.totalRevenueCents,
        currentMonthlySubscriptionEarningCents: period.currentMonthlySubscriptionEarningCents,
        currentSubscribers: period.currentSubscribers,
        tiers: [...period.tiers.values()].sort((left, right) => left.tierLabel.localeCompare(right.tierLabel))
      }))

  return {
    tiers: [...tierOptions.values()].sort((left, right) => left.tierLabel.localeCompare(right.tierLabel)),
    daily: serializePeriods(dailyBuckets),
    monthly: serializePeriods(monthlyBuckets)
  }
}

const buildDailyStats = (visits: DailyStatsVisit[]) => {
  const dayMap = new Map<
    string,
    {
      date: string
      visitors: Set<string>
      totalVisits: number
      signupClicks: number
      signups: number
      patreonSales: number
      totalPurchases: number
      firstPurchaseRevenueCents: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      currentSubscribers: number
    }
  >()

  const ensureDayEntry = (dayKey: string) => {
    const existingEntry = dayMap.get(dayKey) ?? {
      date: dayKey,
      visitors: new Set<string>(),
      totalVisits: 0,
      signupClicks: 0,
      signups: 0,
      patreonSales: 0,
      totalPurchases: 0,
      firstPurchaseRevenueCents: 0,
      totalRevenueCents: 0,
      currentMonthlySubscriptionEarningCents: 0,
      currentSubscribers: 0
    }

    dayMap.set(dayKey, existingEntry)
    return existingEntry
  }

  for (const visit of visits) {
    const visitDay = ensureDayEntry(formatDayKey(visit.firstVisitedAt))
    const sortedRevenueEvents = [...visit.revenueEvents].sort((left, right) => left.chargedAt.getTime() - right.chargedAt.getTime())

    visitDay.visitors.add(visit.visitorId)
    visitDay.totalVisits += visit.visitCount

    if (visit.signupClickedAt) {
      const clickDay = ensureDayEntry(formatDayKey(visit.signupClickedAt))
      clickDay.signupClicks += 1
    }

    if (visit.signupCompletedAt) {
      visitDay.signups += 1
    }

    const currentTier = getCurrentSubscriberTier(visit)

    if (currentTier) {
      const currentSubscriberDay = ensureDayEntry(formatDayKey(visit.signupCompletedAt ?? visit.firstVisitedAt))
      currentSubscriberDay.currentSubscribers += 1
      currentSubscriberDay.currentMonthlySubscriptionEarningCents += currentTier.monthlyTierCents
    }

    if (visit.revenueEvents.length > 0) {
      visitDay.patreonSales += 1
    }

    for (const event of sortedRevenueEvents) {
      const purchaseDay = ensureDayEntry(formatDayKey(event.chargedAt))
      purchaseDay.totalPurchases += 1
      purchaseDay.totalRevenueCents += event.amountCents
    }

    if (sortedRevenueEvents.length > 0) {
      const firstPurchaseDay = ensureDayEntry(formatDayKey(sortedRevenueEvents[0].chargedAt))
      firstPurchaseDay.firstPurchaseRevenueCents += sortedRevenueEvents[0].amountCents
    }
  }

  return [...dayMap.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((dayEntry) => ({
      date: dayEntry.date,
      uniqueVisitors: dayEntry.visitors.size,
      totalVisits: dayEntry.totalVisits,
      signupClicks: dayEntry.signupClicks,
      signups: dayEntry.signups,
      patreonSales: dayEntry.patreonSales,
      totalPurchases: dayEntry.totalPurchases,
      firstPurchaseRevenueCents: dayEntry.firstPurchaseRevenueCents,
      totalRevenueCents: dayEntry.totalRevenueCents,
      currentMonthlySubscriptionEarningCents: dayEntry.currentMonthlySubscriptionEarningCents,
      currentSubscribers: dayEntry.currentSubscribers,
      clickThroughRate: formatPercentage(dayEntry.signupClicks, dayEntry.visitors.size),
      signupConversionRate: formatPercentage(dayEntry.signups, dayEntry.visitors.size),
      patreonSaleRate: formatPercentage(dayEntry.patreonSales, dayEntry.visitors.size)
    }))
}

const buildLandingPageOverview = (landingPages: LandingPageAdminRecord[], visits: AnalyticsVisit[]) => {
  const visitsByLandingPageId = new Map<string, AnalyticsVisit[]>()

  for (const visit of visits) {
    const existingVisits = visitsByLandingPageId.get(visit.landingPageId) ?? []
    existingVisits.push(visit)
    visitsByLandingPageId.set(visit.landingPageId, existingVisits)
  }

  return landingPages.map((landingPage) => {
    const landingVisits = visitsByLandingPageId.get(landingPage.id) ?? []
    const uniqueVisitors = new Set(landingVisits.map((visit) => visit.visitorId)).size
    const totalVisits = landingVisits.reduce((sum, visit) => sum + visit.visitCount, 0)
    const signupClicks = landingVisits.filter((visit) => visit.signupClickedAt).length
    const signups = landingVisits.filter((visit) => visit.signupCompletedAt).length
    const patreonSales = landingVisits.filter((visit) => visit.revenueEvents.length > 0).length
    const totalPurchases = landingVisits.reduce((sum, visit) => sum + visit.revenueEvents.length, 0)
    const firstPurchaseRevenueCents = landingVisits.reduce(
      (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).firstPurchaseAmountCents,
      0
    )
    const totalRevenueCents = landingVisits.reduce(
      (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).totalRevenueCents,
      0
    )
    const currentSubscriptionSummary = getCurrentSubscriptionSummary(landingVisits)

    const sourceMap = new Map<string, { source: string; signupClicks: number }>()

    for (const visit of landingVisits) {
      const sourceKey = getSourceLabel(visit)
      const sourceEntry = sourceMap.get(sourceKey) ?? {
        source: sourceKey,
        signupClicks: 0
      }

      if (visit.signupClickedAt) {
        sourceEntry.signupClicks += 1
      }

      sourceMap.set(sourceKey, sourceEntry)
    }

    return {
      id: landingPage.id,
      key: landingPage.key,
      name: landingPage.name,
      description: landingPage.description,
      basePath: landingPage.basePath,
      isActive: landingPage.isActive,
      createdAt: landingPage.createdAt.toISOString(),
      updatedAt: landingPage.updatedAt.toISOString(),
      kpis: {
        uniqueVisitors,
        totalVisits,
        signupClicks,
        signups,
        patreonSales,
        totalPurchases,
        firstPurchaseRevenueCents,
        totalRevenueCents,
        currentMonthlySubscriptionEarningCents: currentSubscriptionSummary.currentMonthlySubscriptionEarningCents,
        currentSubscribers: currentSubscriptionSummary.currentSubscribers,
        clickThroughRate: formatPercentage(signupClicks, uniqueVisitors),
        signupConversionRate: formatPercentage(signups, uniqueVisitors),
        patreonSaleRate: formatPercentage(patreonSales, uniqueVisitors)
      },
      sources: [...sourceMap.values()]
        .sort((left, right) => right.signupClicks - left.signupClicks)
        .slice(0, 8)
    }
  })
}

const buildLandingPagePerformance = (landingPages: LandingPageAdminRecord[], visits: AnalyticsVisit[]) => {
  const visitsByLandingPageId = new Map<string, AnalyticsVisit[]>()

  for (const visit of visits) {
    const existingVisits = visitsByLandingPageId.get(visit.landingPageId) ?? []
    existingVisits.push(visit)
    visitsByLandingPageId.set(visit.landingPageId, existingVisits)
  }

  return landingPages.map((landingPage) => {
    const landingVisits = visitsByLandingPageId.get(landingPage.id) ?? []
    const uniqueVisitors = new Set(landingVisits.map((visit) => visit.visitorId)).size
    const totalVisits = landingVisits.reduce((sum, visit) => sum + visit.visitCount, 0)
    const signupClicks = landingVisits.filter((visit) => visit.signupClickedAt).length
    const signups = landingVisits.filter((visit) => visit.signupCompletedAt).length
    const patreonSales = landingVisits.filter((visit) => visit.revenueEvents.length > 0).length
    const totalPurchases = landingVisits.reduce((sum, visit) => sum + visit.revenueEvents.length, 0)
    const firstPurchaseRevenueCents = landingVisits.reduce(
      (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).firstPurchaseAmountCents,
      0
    )
    const totalRevenueCents = landingVisits.reduce(
      (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).totalRevenueCents,
      0
    )

    return {
      id: landingPage.id,
      key: landingPage.key,
      name: landingPage.name,
      description: landingPage.description,
      basePath: landingPage.basePath,
      isActive: landingPage.isActive,
      createdAt: landingPage.createdAt.toISOString(),
      updatedAt: landingPage.updatedAt.toISOString(),
      kpis: {
        uniqueVisitors,
        totalVisits,
        signupClicks,
        signups,
        patreonSales,
        totalPurchases,
        firstPurchaseRevenueCents,
        totalRevenueCents,
        clickThroughRate: formatPercentage(signupClicks, uniqueVisitors),
        signupConversionRate: formatPercentage(signups, uniqueVisitors),
        patreonSaleRate: formatPercentage(patreonSales, uniqueVisitors)
      },
      dailyStats: buildDailyStats(landingVisits)
    }
  })
}

const getLandingPageStatsOverview = async (input: LandingPageAnalyticsInput = {}) => {
  const db = resolveDb(input.db)
  const now = input.now ?? new Date()
  const [landingPages, shortUrls, rawVisits] = await Promise.all([
    listLandingPageAdminRows({
      db
    }),
    db.landingPageShortUrl.findMany({
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        targets: {
          orderBy: {
            createdAt: 'asc'
          },
          include: {
            landingPage: {
              select: {
                id: true,
                key: true,
                name: true,
                basePath: true,
                isActive: true
              }
            }
          }
        }
      }
    }) as Promise<ShortUrlOverviewRow[]>,
    db.landingPageVisit.findMany({
      include: {
        shortUrl: {
          select: {
            id: true,
            key: true,
            name: true
          }
        },
        attributedUser: {
          select: {
            id: true,
            patreonAccount: {
              select: {
                membershipStatus: true,
                tierCents: true,
                pledgeCadenceMonths: true,
                lastChargeDate: true,
                nextChargeDate: true
              }
            }
          }
        },
        revenueEvents: {
          orderBy: {
            chargedAt: 'asc'
          },
          select: {
            tierCode: true,
            amountCents: true,
            chargedAt: true
          }
        }
      }
    }) as Promise<AnalyticsVisit[]>
  ])
  const [visits] = await hydrateVisitGroupsWithActiveEntitlements(db, now, [rawVisits])

  const landingPageOverview = buildLandingPageOverview(landingPages, visits)
  const uniqueVisitors = new Set(visits.map((visit) => visit.visitorId)).size
  const totalVisits = visits.reduce((sum, visit) => sum + visit.visitCount, 0)
  const signupClicks = visits.filter((visit) => visit.signupClickedAt).length
  const signups = visits.filter((visit) => visit.signupCompletedAt).length
  const patreonSales = visits.filter((visit) => visit.revenueEvents.length > 0).length
  const totalPurchases = visits.reduce((sum, visit) => sum + visit.revenueEvents.length, 0)
  const firstPurchaseRevenueCents = visits.reduce(
    (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).firstPurchaseAmountCents,
    0
  )
  const totalRevenueCents = visits.reduce(
    (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).totalRevenueCents,
    0
  )
  const currentSubscriptionSummary = getCurrentSubscriptionSummary(visits)
  const subscriptionEarningsChart = buildSubscriptionEarningsChart(visits)

  const shortUrlOverview = shortUrls.map((shortUrl) => {
    const shortUrlVisits = visits.filter((visit) => visit.shortUrl?.id === shortUrl.id)
    const shortUrlKpis = buildVisitKpis(shortUrlVisits)
    const targetStats = shortUrl.targets.map((target) => {
      const targetVisits = shortUrlVisits.filter((visit) => visit.landingPageId === target.landingPageId)
      const targetKpis = buildVisitKpis(targetVisits)

      return {
        id: target.id,
        landingPageId: target.landingPageId,
        landingPageKey: target.landingPage.key,
        landingPageName: target.landingPage.name,
        basePath: target.landingPage.basePath,
        isActive: target.landingPage.isActive,
        weight: target.weight,
        totalClicks: targetKpis.totalVisits,
        totalSignups: targetKpis.signups,
        totalRevenueCents: targetKpis.totalRevenueCents,
        kpis: targetKpis
      }
    })

    return {
      id: shortUrl.id,
      key: shortUrl.key,
      name: shortUrl.name,
      description: shortUrl.description,
      utmSource: shortUrl.utmSource,
      utmMedium: shortUrl.utmMedium,
      utmCampaign: shortUrl.utmCampaign,
      utmContent: shortUrl.utmContent,
      utmTerm: shortUrl.utmTerm,
      isActive: shortUrl.isActive,
      createdAt: shortUrl.createdAt.toISOString(),
      updatedAt: shortUrl.updatedAt.toISOString(),
      totalClicks: shortUrlKpis.totalVisits,
      totalSignups: shortUrlKpis.signups,
      totalRevenueCents: shortUrlKpis.totalRevenueCents,
      kpis: shortUrlKpis,
      targets: targetStats
    }
  })

  return {
    summary: {
      totalLandingPages: landingPages.length,
      activeLandingPages: landingPages.filter((landingPage) => landingPage.isActive).length,
      totalShortUrls: shortUrls.length,
      activeShortUrls: shortUrls.filter((shortUrl) => shortUrl.isActive).length,
      uniqueVisitors,
      totalVisits,
      signupClicks,
      signups,
      patreonSales,
      totalPurchases,
      firstPurchaseRevenueCents,
      totalRevenueCents,
      currentMonthlySubscriptionEarningCents: currentSubscriptionSummary.currentMonthlySubscriptionEarningCents,
      currentSubscribers: currentSubscriptionSummary.currentSubscribers,
      clickThroughRate: formatPercentage(signupClicks, uniqueVisitors),
      signupConversionRate: formatPercentage(signups, uniqueVisitors),
      patreonSaleRate: formatPercentage(patreonSales, uniqueVisitors)
    },
    subscriptionEarningsChart,
    landingPages: landingPageOverview,
    shortUrls: shortUrlOverview
  }
}

const getLandingPageTrafficReport = async (input: LandingPageAnalyticsInput = {}) => {
  const db = resolveDb(input.db)
  const now = input.now ?? new Date()
  const [landingPages, shortUrls, rawSignedUpVisits, rawAllVisits] = await Promise.all([
    listLandingPageAdminRows({
      db
    }),
    db.landingPageShortUrl.findMany({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        id: true,
        key: true,
        name: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        isActive: true
      }
    }) as Promise<ShortUrlTrafficRow[]>,
    db.landingPageVisit.findMany({
      where: {
        signedUpUserId: {
          not: null
        }
      },
      orderBy: {
        signupCompletedAt: 'desc'
      },
      include: {
        shortUrl: {
          select: {
            key: true,
            name: true
          }
        },
        attributedUser: {
          select: {
            id: true,
            email: true,
            username: true,
            createdAt: true,
            patreonAccount: {
              select: {
                membershipStatus: true,
                tierCents: true,
                pledgeCadenceMonths: true,
                lastChargeDate: true,
                nextChargeDate: true
              }
            }
          }
        },
        revenueEvents: {
          orderBy: {
            chargedAt: 'asc'
          },
          select: {
            id: true,
            kind: true,
            tierCode: true,
            amountCents: true,
            chargedAt: true
          }
        },
        landingPage: {
          select: {
            id: true,
            key: true,
            name: true,
            basePath: true
          }
        }
      }
    }) as Promise<AnalyticsVisit[]>,
    db.landingPageVisit.findMany({
      include: {
        shortUrl: {
          select: {
            id: true,
            key: true,
            name: true
          }
        },
        landingPage: {
          select: {
            id: true,
            key: true,
            name: true,
            basePath: true
          }
        },
        attributedUser: {
          select: {
            id: true,
            patreonAccount: {
              select: {
                membershipStatus: true,
                tierCents: true,
                pledgeCadenceMonths: true,
                lastChargeDate: true,
                nextChargeDate: true
              }
            }
          }
        },
        revenueEvents: {
          orderBy: {
            chargedAt: 'asc'
          },
          select: {
            amountCents: true,
            chargedAt: true
          }
        }
      }
    }) as Promise<AnalyticsVisit[]>
  ])
  const [signedUpVisits, allVisits] = await hydrateVisitGroupsWithActiveEntitlements(db, now, [
    rawSignedUpVisits,
    rawAllVisits
  ])

  const landingPageRows = landingPages.map((landingPage) => ({
    ...landingPage,
    dailyStats: buildDailyStats(allVisits.filter((visit) => visit.landingPageId === landingPage.id))
  }))

  const shortUrlRows = shortUrls.map((shortUrl) => ({
    ...shortUrl,
    dailyStats: buildDailyStats(allVisits.filter((visit) => visit.shortUrl?.id === shortUrl.id))
  }))

  const sourceMap = new Map<
    string,
    {
      landingPageId: string
      landingPageKey: string
      landingPageName: string
      source: string
      medium: string | null
      campaign: string | null
      content: string | null
      term: string | null
      shortUrlKey: string | null
      uniqueVisitors: Set<string>
      uniqueUsers: Set<string>
      totalVisits: number
      signupClicks: number
      signups: number
      patreonSales: number
      totalPurchases: number
      firstPurchaseRevenueCents: number
      totalRevenueCents: number
      currentMonthlySubscriptionEarningCents: number
      currentSubscribers: number
      visits: AnalyticsVisit[]
    }
  >()

  for (const visit of allVisits) {
    const landingPage = visit.landingPage

    if (!landingPage) {
      continue
    }

    const sourceLabel = getSourceLabel(visit)
    const sourceKey = [
      visit.landingPageId,
      sourceLabel,
      visit.medium ?? '',
      visit.campaign ?? '',
      visit.content ?? '',
      visit.term ?? '',
      visit.shortUrl?.key ?? ''
    ].join('::')
    const revenueSummary = getRevenueSummaryForEvents(visit.revenueEvents)
    const currentTier = getCurrentSubscriberTier(visit)
    const existingSourceRow = sourceMap.get(sourceKey) ?? {
      landingPageId: visit.landingPageId,
      landingPageKey: landingPage.key,
      landingPageName: landingPage.name,
      source: sourceLabel,
      medium: visit.medium ?? null,
      campaign: visit.campaign ?? null,
      content: visit.content ?? null,
      term: visit.term ?? null,
      shortUrlKey: visit.shortUrl?.key ?? null,
      uniqueVisitors: new Set<string>(),
      uniqueUsers: new Set<string>(),
      totalVisits: 0,
      signupClicks: 0,
      signups: 0,
      patreonSales: 0,
      totalPurchases: 0,
      firstPurchaseRevenueCents: 0,
      totalRevenueCents: 0,
      currentMonthlySubscriptionEarningCents: 0,
      currentSubscribers: 0,
      visits: []
    }

    existingSourceRow.visits.push(visit)
    existingSourceRow.uniqueVisitors.add(visit.visitorId)
    if (visit.signedUpUserId) {
      existingSourceRow.uniqueUsers.add(visit.signedUpUserId)
    }
    existingSourceRow.totalVisits += visit.visitCount
    existingSourceRow.signupClicks += visit.signupClickedAt ? 1 : 0
    existingSourceRow.signups += visit.signupCompletedAt ? 1 : 0
    existingSourceRow.patreonSales += visit.revenueEvents.length > 0 ? 1 : 0
    existingSourceRow.totalPurchases += revenueSummary.totalPurchases
    existingSourceRow.firstPurchaseRevenueCents += revenueSummary.firstPurchaseAmountCents
    existingSourceRow.totalRevenueCents += revenueSummary.totalRevenueCents
    existingSourceRow.currentMonthlySubscriptionEarningCents += currentTier?.monthlyTierCents ?? 0
    existingSourceRow.currentSubscribers += currentTier ? 1 : 0
    sourceMap.set(sourceKey, existingSourceRow)
  }

  const userRows = signedUpVisits
    .flatMap((visit) => {
      const user = visit.attributedUser
      const landingPage = visit.landingPage

      if (!user || !landingPage) {
        return []
      }

      const revenueSummary = getRevenueSummaryForEvents(visit.revenueEvents)
      const sourceLabel = getSourceLabel(visit)
      const currentTier = getCurrentSubscriberTier(visit)

      return [
        {
          userId: user.id,
          email: user.email ?? null,
          username: user.username ?? null,
          landingPageId: visit.landingPageId,
          landingPageKey: landingPage.key,
          landingPageName: landingPage.name,
          basePath: landingPage.basePath,
          source: sourceLabel,
          medium: visit.medium ?? null,
          campaign: visit.campaign ?? null,
          content: visit.content ?? null,
          term: visit.term ?? null,
          shortUrlKey: visit.shortUrl?.key ?? null,
          shortUrlName: visit.shortUrl?.name ?? null,
          signedUpAt: (visit.signupCompletedAt ?? user.createdAt ?? visit.firstVisitedAt).toISOString(),
          firstPurchaseAt: revenueSummary.firstPurchaseAt,
          firstPurchaseAmountCents: revenueSummary.firstPurchaseAmountCents,
          lastPurchaseAt: revenueSummary.lastPurchaseAt,
          totalPurchases: revenueSummary.totalPurchases,
          totalRevenueCents: revenueSummary.totalRevenueCents,
          membershipStatus: user.patreonAccount?.membershipStatus ?? 'not-connected',
          currentTierCents: currentTier?.monthlyTierCents ?? 0,
          currentMonthlySubscriptionEarningCents: currentTier?.monthlyTierCents ?? 0,
          purchaseHistory: visit.revenueEvents.map((event) => ({
            id: event.id,
            kind: event.kind,
            tierCode: event.tierCode,
            amountCents: event.amountCents,
            chargedAt: event.chargedAt.toISOString()
          }))
        }
      ]
    })
    .sort((left, right) => {
      if (right.totalRevenueCents !== left.totalRevenueCents) {
        return right.totalRevenueCents - left.totalRevenueCents
      }

      return right.signedUpAt.localeCompare(left.signedUpAt)
    })

  const sourceRows = [...sourceMap.values()]
    .map((sourceRow) => ({
      landingPageId: sourceRow.landingPageId,
      landingPageKey: sourceRow.landingPageKey,
      landingPageName: sourceRow.landingPageName,
      source: sourceRow.source,
      medium: sourceRow.medium,
      campaign: sourceRow.campaign,
      content: sourceRow.content,
      term: sourceRow.term,
      shortUrlKey: sourceRow.shortUrlKey,
      uniqueVisitors: sourceRow.uniqueVisitors.size,
      uniqueUsers: sourceRow.uniqueUsers.size,
      totalVisits: sourceRow.totalVisits,
      signupClicks: sourceRow.signupClicks,
      signups: sourceRow.signups,
      patreonSales: sourceRow.patreonSales,
      totalPurchases: sourceRow.totalPurchases,
      firstPurchaseRevenueCents: sourceRow.firstPurchaseRevenueCents,
      totalRevenueCents: sourceRow.totalRevenueCents,
      currentMonthlySubscriptionEarningCents: sourceRow.currentMonthlySubscriptionEarningCents,
      currentSubscribers: sourceRow.currentSubscribers,
      dailyStats: buildDailyStats(sourceRow.visits),
      clickThroughRate: formatPercentage(sourceRow.signupClicks, sourceRow.uniqueVisitors.size),
      signupConversionRate: formatPercentage(sourceRow.signups, sourceRow.uniqueVisitors.size),
      patreonSaleRate: formatPercentage(sourceRow.patreonSales, sourceRow.uniqueVisitors.size)
    }))
    .sort((left, right) => {
      if (right.totalRevenueCents !== left.totalRevenueCents) {
        return right.totalRevenueCents - left.totalRevenueCents
      }

      if (right.signups !== left.signups) {
        return right.signups - left.signups
      }

      return right.signupClicks - left.signupClicks
    })

  return {
    summary: {
      attributedUsers: userRows.length,
      signedUpUsers: userRows.length,
      purchasingUsers: userRows.filter((row) => row.totalPurchases > 0).length,
      totalPurchases: userRows.reduce((sum, row) => sum + row.totalPurchases, 0),
      firstPurchaseRevenueCents: userRows.reduce((sum, row) => sum + row.firstPurchaseAmountCents, 0),
      totalRevenueCents: userRows.reduce((sum, row) => sum + row.totalRevenueCents, 0),
      currentMonthlySubscriptionEarningCents: userRows.reduce((sum, row) => sum + row.currentMonthlySubscriptionEarningCents, 0),
      currentSubscribers: userRows.filter((row) => row.currentMonthlySubscriptionEarningCents > 0).length
    },
    landingPages: landingPageRows,
    shortUrls: shortUrlRows,
    sources: sourceRows,
    users: userRows
  }
}

const getLandingPagePerformanceReport = async (input: LandingPageAnalyticsInput = {}) => {
  const db = resolveDb(input.db)
  const now = input.now ?? new Date()
  const [landingPages, shortUrls, rawVisits] = await Promise.all([
    listLandingPageAdminRows({
      db
    }),
    db.landingPageShortUrl.findMany({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    }) as Promise<ShortUrlPerformanceRow[]>,
    db.landingPageVisit.findMany({
      include: {
        shortUrl: {
          select: {
            id: true
          }
        },
        attributedUser: {
          select: {
            id: true,
            patreonAccount: {
              select: {
                membershipStatus: true,
                tierCents: true,
                pledgeCadenceMonths: true,
                lastChargeDate: true,
                nextChargeDate: true
              }
            }
          }
        },
        revenueEvents: {
          orderBy: {
            chargedAt: 'asc'
          },
          select: {
            amountCents: true,
            chargedAt: true
          }
        }
      }
    }) as Promise<AnalyticsVisit[]>
  ])
  const [visits] = await hydrateVisitGroupsWithActiveEntitlements(db, now, [rawVisits])

  const performanceLandingPages = buildLandingPagePerformance(landingPages, visits)
  const performanceShortUrls = shortUrls.map((shortUrl) => {
    const shortUrlVisits = visits.filter((visit) => visit.shortUrl?.id === shortUrl.id)

    return {
      id: shortUrl.id,
      key: shortUrl.key,
      name: shortUrl.name,
      description: shortUrl.description,
      utmSource: shortUrl.utmSource,
      utmMedium: shortUrl.utmMedium,
      utmCampaign: shortUrl.utmCampaign,
      utmContent: shortUrl.utmContent,
      utmTerm: shortUrl.utmTerm,
      isActive: shortUrl.isActive,
      createdAt: shortUrl.createdAt.toISOString(),
      updatedAt: shortUrl.updatedAt.toISOString(),
      kpis: buildVisitKpis(shortUrlVisits),
      dailyStats: buildDailyStats(shortUrlVisits)
    }
  })
  const uniqueVisitors = new Set(visits.map((visit) => visit.visitorId)).size
  const totalVisits = visits.reduce((sum, visit) => sum + visit.visitCount, 0)
  const signupClicks = visits.filter((visit) => visit.signupClickedAt).length
  const signups = visits.filter((visit) => visit.signupCompletedAt).length
  const patreonSales = visits.filter((visit) => visit.revenueEvents.length > 0).length
  const totalPurchases = visits.reduce((sum, visit) => sum + visit.revenueEvents.length, 0)
  const firstPurchaseRevenueCents = visits.reduce(
    (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).firstPurchaseAmountCents,
    0
  )
  const totalRevenueCents = visits.reduce(
    (sum, visit) => sum + getRevenueSummaryForEvents(visit.revenueEvents).totalRevenueCents,
    0
  )
  const currentSubscriptionSummary = getCurrentSubscriptionSummary(visits)

  return {
    summary: {
      totalLandingPages: landingPages.length,
      activeLandingPages: landingPages.filter((landingPage) => landingPage.isActive).length,
      totalShortUrls: shortUrls.length,
      activeShortUrls: shortUrls.filter((shortUrl) => shortUrl.isActive).length,
      uniqueVisitors,
      totalVisits,
      signupClicks,
      signups,
      patreonSales,
      totalPurchases,
      firstPurchaseRevenueCents,
      totalRevenueCents,
      currentMonthlySubscriptionEarningCents: currentSubscriptionSummary.currentMonthlySubscriptionEarningCents,
      currentSubscribers: currentSubscriptionSummary.currentSubscribers,
      clickThroughRate: formatPercentage(signupClicks, uniqueVisitors),
      signupConversionRate: formatPercentage(signups, uniqueVisitors),
      patreonSaleRate: formatPercentage(patreonSales, uniqueVisitors)
    },
    landingPages: performanceLandingPages,
    shortUrls: performanceShortUrls
  }
}

export {
  getLandingPagePerformanceReport,
  getLandingPageStatsOverview,
  getLandingPageTrafficReport
}
export type { LandingPageAnalyticsDatabase }
