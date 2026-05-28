import { Router } from 'express'
import { z } from 'zod'
import {
  trackLandingPageSignupClick,
  trackLandingPageVisit
} from '../services/landing/landing-page-attribution-service'
import { normalizeLandingPageKey, normalizeLandingPagePath } from '../services/landing/landing-page-paths'
import {
  getLandingPagePerformanceReport,
  getLandingPageStatsOverview,
  getLandingPageTrafficReport
} from '../services/landing/landing-page-analytics-read-model-service'
import { listLandingPageAdminRows } from '../services/landing/landing-page-admin-row-service'
import {
  getDefaultHomepageSetting,
  updateDefaultHomepageSetting
} from '../services/landing/default-homepage-service'
import { listLandingPageTrackingIssues } from '../services/landing/landing-page-tracking-issue-service'
import { prisma } from '../lib/prisma'
import { runPublicTrackingPersistence } from '../lib/public-tracking-persistence'
import { requireAdmin } from '../middleware/auth-middleware'

const landingPageRoutes = Router()

const publicTrackVisitSchema = z
  .object({
    landingPageKey: z.string().trim().min(1).max(80),
    landingPageName: z.string().trim().min(1).max(120).optional(),
    variantKey: z.string().trim().min(1).max(80).optional(),
    variantName: z.string().trim().min(1).max(120).optional(),
    shortUrlKey: z.string().trim().min(1).max(80).optional().nullable(),
    routePath: z.string().trim().min(1).max(255),
    source: z.string().trim().max(191).optional().nullable(),
    medium: z.string().trim().max(191).optional().nullable(),
    campaign: z.string().trim().max(191).optional().nullable(),
    content: z.string().trim().max(191).optional().nullable(),
    term: z.string().trim().max(191).optional().nullable(),
    landingUrl: z.string().trim().max(1000).optional().nullable(),
    referrer: z.string().trim().max(1000).optional().nullable(),
    gaClientId: z.string().trim().max(128).optional().nullable(),
    gaSessionId: z.string().trim().max(128).optional().nullable()
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
      .optional()
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

const shortUrlTargetSchema = z
  .object({
    landingPageId: z.string().trim().min(1),
    weight: z.number().int().min(1).max(10000).optional()
  })
  .strict()

const shortUrlUtmSchemaFields = {
  utmSource: z.string().trim().max(191).nullable().optional(),
  utmMedium: z.string().trim().max(191).nullable().optional(),
  utmCampaign: z.string().trim().max(191).nullable().optional(),
  utmContent: z.string().trim().max(191).nullable().optional(),
  utmTerm: z.string().trim().max(191).nullable().optional()
}

const updateDefaultHomepageSchema = z
  .object({
    landingPageId: z.string().trim().min(1).nullable()
  })
  .strict()

const adminCreateShortUrlSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
    ...shortUrlUtmSchemaFields,
    targets: z.array(shortUrlTargetSchema).min(1).max(20)
  })
  .strict()

const adminUpdateShortUrlSchema = z
  .object({
    key: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    ...shortUrlUtmSchemaFields,
    targets: z.array(shortUrlTargetSchema).min(1).max(20).optional()
  })
  .strict()

const normalizeKey = (value: string) => normalizeLandingPageKey(value, '')

const normalizePath = (value: string) => normalizeLandingPagePath(value)

const normalizeNullableText = (value: string | null | undefined) => value?.trim() || null

type LandingPageVariantOptionRow = {
  id: string
  landingPageId: string
  key: string
  name: string
  routePath: string
  createdAt: Date | string
}

const listLandingPageOptionRows = async () => {
  const landingPages = await listLandingPageAdminRows()
  const variants = await prisma.$queryRaw<LandingPageVariantOptionRow[]>`
    SELECT
      "id",
      "landingPageId",
      "key",
      "name",
      "routePath",
      "createdAt"
    FROM "LandingPageVariant"
    ORDER BY "createdAt" ASC, "id" ASC
  `
  const variantsByLandingPageId = new Map<string, Array<{
    id: string
    key: string
    name: string
    routePath: string
  }>>()

  for (const variant of variants) {
    const landingPageVariants = variantsByLandingPageId.get(variant.landingPageId) ?? []
    landingPageVariants.push({
      id: variant.id,
      key: variant.key,
      name: variant.name,
      routePath: variant.routePath
    })
    variantsByLandingPageId.set(variant.landingPageId, landingPageVariants)
  }

  return landingPages.map((landingPage) => ({
    id: landingPage.id,
    key: landingPage.key,
    name: landingPage.name,
    basePath: landingPage.basePath,
    isActive: landingPage.isActive,
    variants: variantsByLandingPageId.get(landingPage.id) ?? []
  }))
}

const buildShortUrlUtmData = (payload: {
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
}) => ({
  ...(payload.utmSource !== undefined ? { utmSource: normalizeNullableText(payload.utmSource) } : {}),
  ...(payload.utmMedium !== undefined ? { utmMedium: normalizeNullableText(payload.utmMedium) } : {}),
  ...(payload.utmCampaign !== undefined ? { utmCampaign: normalizeNullableText(payload.utmCampaign) } : {}),
  ...(payload.utmContent !== undefined ? { utmContent: normalizeNullableText(payload.utmContent) } : {}),
  ...(payload.utmTerm !== undefined ? { utmTerm: normalizeNullableText(payload.utmTerm) } : {})
})

const pickWeightedTarget = <T extends { weight: number }>(targets: T[]) => {
  const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0)

  if (totalWeight <= 0) {
    return targets[0] ?? null
  }

  let cursor = Math.random() * totalWeight

  for (const target of targets) {
    cursor -= target.weight

    if (cursor <= 0) {
      return target
    }
  }

  return targets[targets.length - 1] ?? null
}

landingPageRoutes.post('/landing-pages/track-visit', async (request, response, next) => {
  try {
    const payload = publicTrackVisitSchema.parse(request.body)
    const trackedVisit = await runPublicTrackingPersistence(
      () =>
        trackLandingPageVisit(request, response, {
          ...payload,
          routePath: normalizePath(payload.routePath),
          userAgent: request.get('user-agent') ?? null
        }),
      {
        operationName: 'landing.trackVisit'
      }
    )

    response.status(201).json({
      data: trackedVisit
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.post('/landing-pages/track-signup-click', async (request, response, next) => {
  try {
    const trackedClick = await runPublicTrackingPersistence(
      () => trackLandingPageSignupClick(request),
      {
        operationName: 'landing.trackSignupClick'
      }
    )

    response.status(201).json({
      data: trackedClick
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/landing-pages/short-urls/:key/resolve', async (request, response, next) => {
  try {
    const params = z.object({ key: z.string().trim().min(1).max(80) }).parse(request.params)
    const shortUrl = await prisma.landingPageShortUrl.findUnique({
      where: {
        key: normalizeKey(params.key)
      },
      include: {
        targets: {
          where: {
            landingPage: {
              isActive: true
            }
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
    })

    if (!shortUrl || !shortUrl.isActive) {
      response.status(404).json({
        message: 'Short URL not found.'
      })
      return
    }

    const activeTargets = shortUrl.targets.filter((target) => target.landingPage.isActive && target.landingPage.basePath)
    const selectedTarget = pickWeightedTarget(activeTargets)

    if (!selectedTarget?.landingPage.basePath) {
      response.status(404).json({
        message: 'Short URL has no active landing page targets.'
      })
      return
    }

    response.json({
      data: {
        key: shortUrl.key,
        name: shortUrl.name,
        utmSource: shortUrl.utmSource,
        utmMedium: shortUrl.utmMedium,
        utmCampaign: shortUrl.utmCampaign,
        utmContent: shortUrl.utmContent,
        utmTerm: shortUrl.utmTerm,
        targetPath: selectedTarget.landingPage.basePath,
        landingPageId: selectedTarget.landingPage.id,
        landingPageKey: selectedTarget.landingPage.key,
        landingPageName: selectedTarget.landingPage.name
      }
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/landing-pages/default-homepage', async (_request, response, next) => {
  try {
    response.json({
      data: await getDefaultHomepageSetting()
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/stats/landing-pages', requireAdmin, async (_request, response, next) => {
  try {
    response.json({
      data: await getLandingPageStatsOverview()
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/stats/landing-pages/traffic', requireAdmin, async (_request, response, next) => {
  try {
    response.json({
      data: await getLandingPageTrafficReport()
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/stats/landing-pages/performance', requireAdmin, async (_request, response, next) => {
  try {
    response.json({
      data: await getLandingPagePerformanceReport()
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
    const initialVariant = payload.initialVariant
      ? {
          key: normalizeKey(payload.initialVariant.key),
          name: payload.initialVariant.name.trim(),
          routePath: normalizePath(payload.initialVariant.routePath),
          notes: payload.initialVariant.notes?.trim() || null,
          isControl: payload.initialVariant.isControl ?? true
        }
      : {
          key: 'default',
          name: 'Default Route',
          routePath: basePath,
          notes: null,
          isControl: true
        }

    const created = await prisma.landingPage.create({
      data: {
        key,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        basePath,
        variants: {
          create: initialVariant
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

landingPageRoutes.post('/admin/landing-page-short-urls', requireAdmin, async (request, response, next) => {
  try {
    const payload = adminCreateShortUrlSchema.parse(request.body)
    const created = await prisma.landingPageShortUrl.create({
      data: {
        key: normalizeKey(payload.key),
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        ...buildShortUrlUtmData(payload),
        isActive: payload.isActive ?? true,
        targets: {
          create: payload.targets.map((target) => ({
            landingPageId: target.landingPageId,
            weight: target.weight ?? 100
          }))
        }
      },
      include: {
        targets: true
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

landingPageRoutes.patch('/admin/landing-page-short-urls/:id', requireAdmin, async (request, response, next) => {
  try {
    const params = z.object({ id: z.string().trim().min(1) }).parse(request.params)
    const payload = adminUpdateShortUrlSchema.parse(request.body)

    const updated = await prisma.$transaction(async (transaction) => {
      const shortUrl = await transaction.landingPageShortUrl.update({
        where: {
          id: params.id
        },
        data: {
          ...(payload.key ? { key: normalizeKey(payload.key) } : {}),
          ...(payload.name ? { name: payload.name.trim() } : {}),
          ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
          ...buildShortUrlUtmData(payload),
          ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {})
        }
      })

      if (payload.targets) {
        await transaction.landingPageShortUrlTarget.deleteMany({
          where: {
            shortUrlId: params.id
          }
        })

        await transaction.landingPageShortUrlTarget.createMany({
          data: payload.targets.map((target) => ({
            shortUrlId: params.id,
            landingPageId: target.landingPageId,
            weight: target.weight ?? 100
          }))
        })
      }

      return shortUrl
    })

    response.json({
      data: updated
    })
  } catch (error) {
    next(error)
  }
})

// Read-only operational backlog for public tracking payloads that did not
// match configured landing pages or variants. Repair remains in the editor.
landingPageRoutes.get('/admin/landing-pages/tracking-issues', requireAdmin, async (_request, response, next) => {
  try {
    const issues = await listLandingPageTrackingIssues()

    response.json({
      data: issues.map((issue) => ({
        id: issue.id,
        fingerprint: issue.fingerprint,
        kind: issue.kind,
        landingPageKey: issue.landingPageKey,
        variantKey: issue.variantKey,
        routePath: issue.routePath,
        shortUrlKey: issue.shortUrlKey,
        firstSeenAt: issue.firstSeenAt.toISOString(),
        lastSeenAt: issue.lastSeenAt.toISOString(),
        seenCount: issue.seenCount
      }))
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/admin/landing-pages/options', requireAdmin, async (_request, response, next) => {
  try {
    const landingPages = await listLandingPageOptionRows()

    response.json({
      data: landingPages
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.get('/admin/landing-pages/default-homepage', requireAdmin, async (_request, response, next) => {
  try {
    response.json({
      data: await getDefaultHomepageSetting()
    })
  } catch (error) {
    next(error)
  }
})

landingPageRoutes.patch('/admin/landing-pages/default-homepage', requireAdmin, async (request, response, next) => {
  try {
    const payload = updateDefaultHomepageSchema.parse(request.body)

    response.json({
      data: await updateDefaultHomepageSetting(payload.landingPageId)
    })
  } catch (error) {
    next(error)
  }
})

export default landingPageRoutes
