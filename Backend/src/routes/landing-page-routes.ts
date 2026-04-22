import { Router } from 'express'
import { z } from 'zod'
import { ensureLandingPageSignupClickColumn } from '../lib/landing-page-visit-compat'
import {
  trackLandingPageSignupClick,
  trackLandingPageVisit
} from '../lib/landing-page-attribution'
import { prisma } from '../lib/prisma'
import { requireAdmin } from '../middleware/auth-middleware'

const landingPageRoutes = Router()

const publicTrackVisitSchema = z
  .object({
    landingPageKey: z.string().trim().min(1).max(80),
    landingPageName: z.string().trim().min(1).max(120).optional(),
    variantKey: z.string().trim().min(1).max(80).optional(),
    variantName: z.string().trim().min(1).max(120).optional(),
    routePath: z.string().trim().min(1).max(255),
    source: z.string().trim().max(191).optional().nullable(),
    medium: z.string().trim().max(191).optional().nullable(),
    campaign: z.string().trim().max(191).optional().nullable(),
    content: z.string().trim().max(191).optional().nullable(),
    term: z.string().trim().max(191).optional().nullable(),
    landingUrl: z.string().trim().max(1000).optional().nullable(),
    referrer: z.string().trim().max(1000).optional().nullable()
  })
  .strict()

const adminCreateLandingPageSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    basePath: z.string().trim().min(1).max(255),
    initialVariant: z
      .object({
        key: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(120),
        routePath: z.string().trim().min(1).max(255),
        notes: z.string().trim().max(500).optional(),
        isControl: z.boolean().optional()
      })
      .strict()
  })
  .strict()

const adminCreateVariantSchema = z
  .object({
    landingPageId: z.string().trim().min(1),
    key: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    routePath: z.string().trim().min(1).max(255),
    notes: z.string().trim().max(500).optional(),
    weight: z.number().int().min(1).max(10000).optional(),
    isControl: z.boolean().optional()
  })
  .strict()

const adminUpdateLandingPageSchema = z
  .object({
    key: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    basePath: z.string().trim().min(1).max(255).nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict()

const adminUpdateVariantSchema = z
  .object({
    key: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    routePath: z.string().trim().min(1).max(255).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    weight: z.number().int().min(1).max(10000).optional(),
    isControl: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .strict()

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizePath = (value: string) => {
  const trimmed = value.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const formatPercentage = (numerator: number, denominator: number) => {
  if (denominator <= 0) {
    return 0
  }

  return Math.round((numerator / denominator) * 1000) / 10
}

const formatDayKey = (value: Date) => value.toISOString().slice(0, 10)

const buildDailyStats = (
  visits: Array<{
    firstVisitedAt: Date
    visitorId: string
    visitCount: number
    signupClickedAt: Date | null
    signupCompletedAt: Date | null
    attributedUser?: {
      patreonActiveAt: Date | null
    } | null
  }>
) => {
  const dayMap = new Map<
    string,
    {
      date: string
      visitors: Set<string>
      visits: number
      clicks: number
      signups: number
      patreonSales: number
    }
  >()

  const ensureDayEntry = (dayKey: string) => {
    const existingDay = dayMap.get(dayKey) ?? {
      date: dayKey,
      visitors: new Set<string>(),
      visits: 0,
      clicks: 0,
      signups: 0,
      patreonSales: 0
    }

    dayMap.set(dayKey, existingDay)
    return existingDay
  }

  for (const visit of visits) {
    const dayKey = formatDayKey(visit.firstVisitedAt)
    const existingDay = ensureDayEntry(dayKey)

    existingDay.visitors.add(visit.visitorId)
    existingDay.visits += visit.visitCount

    if (visit.signupClickedAt) {
      const clickDay = ensureDayEntry(formatDayKey(visit.signupClickedAt))
      clickDay.clicks += 1
    }

    if (visit.signupCompletedAt) {
      existingDay.signups += 1
    }

    if (visit.attributedUser?.patreonActiveAt) {
      existingDay.patreonSales += 1
    }

    dayMap.set(dayKey, existingDay)
  }

  return [...dayMap.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((dayEntry) => ({
      date: dayEntry.date,
      uniqueVisitors: dayEntry.visitors.size,
      totalVisits: dayEntry.visits,
      signupClicks: dayEntry.clicks,
      signups: dayEntry.signups,
      patreonSales: dayEntry.patreonSales,
      clickThroughRate: formatPercentage(dayEntry.clicks, dayEntry.visitors.size),
      signupConversionRate: formatPercentage(dayEntry.signups, dayEntry.visitors.size),
      patreonSaleRate: formatPercentage(dayEntry.patreonSales, dayEntry.visitors.size)
    }))
}

landingPageRoutes.post('/landing-pages/track-visit', async (request, response, next) => {
  try {
    const payload = publicTrackVisitSchema.parse(request.body)
    const trackedVisit = await trackLandingPageVisit(request, response, {
      ...payload,
      routePath: normalizePath(payload.routePath),
      userAgent: request.get('user-agent') ?? null
    })

    response.status(201).json({
      data: trackedVisit
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.post('/landing-pages/track-signup-click', async (request, response, next) => {
  try {
    const trackedClick = await trackLandingPageSignupClick(request)

    response.status(201).json({
      data: trackedClick
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/stats/landing-pages', requireAdmin, async (_request, response, next) => {
  try {
    await ensureLandingPageSignupClickColumn()

    const landingPages = await prisma.landingPage.findMany({
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        variants: {
          orderBy: [
            {
              isControl: 'desc'
            },
            {
              createdAt: 'asc'
            }
          ],
          include: {
            visits: {
              include: {
                attributedUser: {
                  select: {
                    id: true,
                    patreonLinkedAt: true,
                    patreonActiveAt: true
                  }
                }
              }
            }
          }
        }
      }
    })

    const landingPageStats = landingPages.map((landingPage) => {
      const allVariantVisits = landingPage.variants.flatMap((variant) => variant.visits)
      const uniqueVisitors = new Set(allVariantVisits.map((visit) => visit.visitorId)).size
      const totalVisits = allVariantVisits.reduce((sum, visit) => sum + visit.visitCount, 0)
      const signupClicks = allVariantVisits.filter((visit) => visit.signupClickedAt).length
      const signups = allVariantVisits.filter((visit) => visit.signupCompletedAt).length
      const patreonLinks = allVariantVisits.filter((visit) => visit.attributedUser?.patreonLinkedAt).length
      const patreonSales = allVariantVisits.filter((visit) => visit.attributedUser?.patreonActiveAt).length

      const sourceMap = new Map<
        string,
        { source: string; visitors: Set<string>; visits: number; clicks: number; signups: number; patreonSales: number }
      >()

      for (const visit of allVariantVisits) {
        const sourceKey = visit.source || visit.referrerHost || 'direct'
        const existingSource = sourceMap.get(sourceKey) ?? {
          source: sourceKey,
          visitors: new Set<string>(),
          visits: 0,
          clicks: 0,
          signups: 0,
          patreonSales: 0
        }

        existingSource.visitors.add(visit.visitorId)
        existingSource.visits += visit.visitCount
        if (visit.signupClickedAt) {
          existingSource.clicks += 1
        }
        if (visit.signupCompletedAt) {
          existingSource.signups += 1
        }
        if (visit.attributedUser?.patreonActiveAt) {
          existingSource.patreonSales += 1
        }
        sourceMap.set(sourceKey, existingSource)
      }

      const variantStats = landingPage.variants.map((variant) => {
        const uniqueVariantVisitors = new Set(variant.visits.map((visit) => visit.visitorId)).size
        const variantVisits = variant.visits.reduce((sum, visit) => sum + visit.visitCount, 0)
        const variantSignupClicks = variant.visits.filter((visit) => visit.signupClickedAt).length
        const variantSignups = variant.visits.filter((visit) => visit.signupCompletedAt).length
        const variantPatreonLinks = variant.visits.filter((visit) => visit.attributedUser?.patreonLinkedAt).length
        const variantPatreonSales = variant.visits.filter((visit) => visit.attributedUser?.patreonActiveAt).length
        const dailyStats = buildDailyStats(variant.visits)

        return {
          id: variant.id,
          key: variant.key,
          name: variant.name,
          routePath: variant.routePath,
          notes: variant.notes,
          isControl: variant.isControl,
          isActive: variant.isActive,
          weight: variant.weight,
          uniqueVisitors: uniqueVariantVisitors,
          totalVisits: variantVisits,
          signupClicks: variantSignupClicks,
          signups: variantSignups,
          patreonLinks: variantPatreonLinks,
          patreonSales: variantPatreonSales,
          clickThroughRate: formatPercentage(variantSignupClicks, uniqueVariantVisitors),
          signupConversionRate: formatPercentage(variantSignups, uniqueVariantVisitors),
          patreonLinkRate: formatPercentage(variantPatreonLinks, uniqueVariantVisitors),
          patreonSaleRate: formatPercentage(variantPatreonSales, uniqueVariantVisitors),
          dailyStats
        }
      })

      const dailyStats = buildDailyStats(allVariantVisits)

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
          patreonLinks,
          patreonSales,
          clickThroughRate: formatPercentage(signupClicks, uniqueVisitors),
          signupConversionRate: formatPercentage(signups, uniqueVisitors),
          patreonLinkRate: formatPercentage(patreonLinks, uniqueVisitors),
          patreonSaleRate: formatPercentage(patreonSales, uniqueVisitors)
        },
        dailyStats,
        sources: [...sourceMap.values()]
          .map((sourceEntry) => ({
            source: sourceEntry.source,
            uniqueVisitors: sourceEntry.visitors.size,
            totalVisits: sourceEntry.visits,
            signupClicks: sourceEntry.clicks,
            signups: sourceEntry.signups,
            patreonSales: sourceEntry.patreonSales,
            clickThroughRate: formatPercentage(sourceEntry.clicks, sourceEntry.visitors.size),
            signupConversionRate: formatPercentage(sourceEntry.signups, sourceEntry.visitors.size),
            patreonSaleRate: formatPercentage(sourceEntry.patreonSales, sourceEntry.visitors.size)
          }))
          .sort((left, right) => right.uniqueVisitors - left.uniqueVisitors)
          .slice(0, 8),
        variants: variantStats
      }
    })

    const summary = await prisma.$transaction([
      prisma.landingPage.count(),
      prisma.landingPageVariant.count({
        where: {
          isActive: true
        }
      }),
      prisma.landingPageVisit.findMany({
        include: {
          attributedUser: {
            select: {
              id: true,
              patreonLinkedAt: true,
              patreonActiveAt: true
            }
          }
        }
      })
    ])

    const allVisits = summary[2]
    const globalVisitors = new Set(allVisits.map((visit) => visit.visitorId)).size
    const globalVisits = allVisits.reduce((sum, visit) => sum + visit.visitCount, 0)
    const globalSignupClicks = allVisits.filter((visit) => visit.signupClickedAt).length
    const globalSignups = allVisits.filter((visit) => visit.signupCompletedAt).length
    const globalPatreonLinks = allVisits.filter((visit) => visit.attributedUser?.patreonLinkedAt).length
    const globalPatreonSales = allVisits.filter((visit) => visit.attributedUser?.patreonActiveAt).length
    const activeAttributedPatrons = allVisits.filter(
      (visit) => visit.attributedUser?.patreonActiveAt && visit.attributedUser !== null
    ).length

    response.json({
      data: {
        summary: {
          totalLandingPages: summary[0],
          activeVariants: summary[1],
          uniqueVisitors: globalVisitors,
          totalVisits: globalVisits,
          signupClicks: globalSignupClicks,
          signups: globalSignups,
          patreonLinks: globalPatreonLinks,
          patreonSales: globalPatreonSales,
          activeAttributedPatrons,
          clickThroughRate: formatPercentage(globalSignupClicks, globalVisitors),
          signupConversionRate: formatPercentage(globalSignups, globalVisitors),
          patreonSaleRate: formatPercentage(globalPatreonSales, globalVisitors)
        },
        landingPages: landingPageStats
      }
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.post('/admin/landing-pages', requireAdmin, async (request, response, next) => {
  try {
    const payload = adminCreateLandingPageSchema.parse(request.body)
    const key = normalizeKey(payload.key)
    const basePath = normalizePath(payload.basePath)
    const variantKey = normalizeKey(payload.initialVariant.key)
    const routePath = normalizePath(payload.initialVariant.routePath)

    const created = await prisma.landingPage.create({
      data: {
        key,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        basePath,
        variants: {
          create: {
            key: variantKey,
            name: payload.initialVariant.name.trim(),
            routePath,
            notes: payload.initialVariant.notes?.trim() || null,
            isControl: payload.initialVariant.isControl ?? true
          }
        }
      },
      include: {
        variants: true
      }
    })

    response.status(201).json({
      data: created
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.post('/admin/landing-page-variants', requireAdmin, async (request, response, next) => {
  try {
    const payload = adminCreateVariantSchema.parse(request.body)
    const created = await prisma.landingPageVariant.create({
      data: {
        landingPageId: payload.landingPageId,
        key: normalizeKey(payload.key),
        name: payload.name.trim(),
        routePath: normalizePath(payload.routePath),
        notes: payload.notes?.trim() || null,
        weight: payload.weight ?? 100,
        isControl: payload.isControl ?? false
      }
    })

    response.status(201).json({
      data: created
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.patch('/admin/landing-pages/:id', requireAdmin, async (request, response, next) => {
  try {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params)
    const payload = adminUpdateLandingPageSchema.parse(request.body)

    const updated = await prisma.landingPage.update({
      where: {
        id: params.id
      },
      data: {
        ...(payload.key ? { key: normalizeKey(payload.key) } : {}),
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
        ...(payload.basePath !== undefined ? { basePath: payload.basePath ? normalizePath(payload.basePath) : null } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {})
      }
    })

    response.json({
      data: updated
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.patch('/admin/landing-page-variants/:id', requireAdmin, async (request, response, next) => {
  try {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params)
    const payload = adminUpdateVariantSchema.parse(request.body)

    const updated = await prisma.landingPageVariant.update({
      where: {
        id: params.id
      },
      data: {
        ...(payload.key ? { key: normalizeKey(payload.key) } : {}),
        ...(payload.name ? { name: payload.name.trim() } : {}),
        ...(payload.routePath ? { routePath: normalizePath(payload.routePath) } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
        ...(payload.weight !== undefined ? { weight: payload.weight } : {}),
        ...(payload.isControl !== undefined ? { isControl: payload.isControl } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {})
      }
    })

    response.json({
      data: updated
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/admin/landing-pages/options', requireAdmin, async (_request, response, next) => {
  try {
    const landingPages = await prisma.landingPage.findMany({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        id: true,
        key: true,
        name: true,
        basePath: true,
        variants: {
          orderBy: {
            createdAt: 'asc'
          },
          select: {
            id: true,
            key: true,
            name: true,
            routePath: true
          }
        }
      }
    })

    response.json({
      data: landingPages
    })
  } catch (error) {
    next(error)
  }
})

export default landingPageRoutes
