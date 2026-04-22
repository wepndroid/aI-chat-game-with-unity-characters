import { Router } from 'express'
import { z } from 'zod'
import {
  DEFAULT_OWNER_EMAIL,
  DEFAULT_PUBLIC_ASSET_BASE_URL,
  DEFAULT_SOURCE_BASE_URL,
  getLegacyImportOverview,
  runLegacyImport,
  runLegacyTaglineBackfill
} from '../lib/legacy-character-import'
import { prisma } from '../lib/prisma'
import { requireAdmin } from '../middleware/auth-middleware'

const legacyImportRoutes = Router()

const legacyImportRunSchema = z
  .object({
    ownerEmail: z.string().email().optional(),
    sourceBaseUrl: z.string().url().optional(),
    publicAssetBaseUrl: z.string().url().optional(),
    dryRun: z.boolean().optional(),
    skipDownloads: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).nullable().optional()
  })
  .strict()

const legacyTaglineBackfillSchema = z
  .object({
    forceUpdate: z.boolean().optional()
  })
  .strict()

const getDefaultPublicAssetBaseUrl = () =>
  process.env.PUBLIC_ASSET_BASE_URL?.trim() || process.env.BACKEND_PUBLIC_URL?.trim() || DEFAULT_PUBLIC_ASSET_BASE_URL

const logLegacyImportActivity = async (message: string) => {
  try {
    await prisma.systemActivityLog.create({
      data: {
        message,
        tone: 'blue'
      }
    })
  } catch {
    // Activity logging is best-effort and should not fail the import workflow.
  }
}

legacyImportRoutes.get('/admin/legacy-import/overview', requireAdmin, async (request, response, next) => {
  try {
    const overview = await getLegacyImportOverview(prisma, request.authUser?.email ?? DEFAULT_OWNER_EMAIL)

    response.json({
      data: overview
    })
  } catch (error) {
    next(error)
  }
})

legacyImportRoutes.post('/admin/legacy-import/run', requireAdmin, async (request, response, next) => {
  try {
    const parsed = legacyImportRunSchema.parse(request.body ?? {})
    const result = await runLegacyImport(prisma, {
      ownerEmail: parsed.ownerEmail ?? request.authUser?.email ?? DEFAULT_OWNER_EMAIL,
      sourceBaseUrl: parsed.sourceBaseUrl ?? DEFAULT_SOURCE_BASE_URL,
      publicAssetBaseUrl: parsed.publicAssetBaseUrl ?? getDefaultPublicAssetBaseUrl(),
      dryRun: parsed.dryRun === true,
      skipDownloads: parsed.skipDownloads === true,
      limit: parsed.limit ?? null
    })

    await logLegacyImportActivity(
      result.options.dryRun
        ? `Admin ran a legacy import dry run for ${result.stats.scanned} models.`
        : `Admin imported legacy models: ${result.stats.created} created, ${result.stats.updated} updated.`
    )

    response.json({
      data: result
    })
  } catch (error) {
    next(error)
  }
})

legacyImportRoutes.post('/admin/legacy-import/backfill-taglines', requireAdmin, async (request, response, next) => {
  try {
    const parsed = legacyTaglineBackfillSchema.parse(request.body ?? {})
    const result = await runLegacyTaglineBackfill(prisma, {
      forceUpdate: parsed.forceUpdate === true
    })

    await logLegacyImportActivity(`Admin backfilled legacy taglines: ${result.updated} updated, ${result.skipped} skipped.`)

    response.json({
      data: result
    })
  } catch (error) {
    next(error)
  }
})

export default legacyImportRoutes
