import { apiGet, apiPost } from '@/lib/api-client'

type LegacyImportOverviewResponse = {
  data: {
    defaults: {
      ownerEmail: string
      sourceBaseUrl: string
      publicAssetBaseUrl: string
    }
    legacySource: {
      reachable: boolean
      modelCount: number | null
      errorMessage: string | null
    }
    coverage: {
      mappedTaglines: number
    }
    imported: {
      characters: number
      withTagline: number
      missingTagline: number
      missingPreviewImage: number
    }
  }
}

type LegacyImportRunRequest = {
  ownerEmail: string
  sourceBaseUrl: string
  publicAssetBaseUrl: string
  dryRun?: boolean
  skipDownloads?: boolean
  limit?: number | null
}

type LegacyImportRunResponse = {
  data: {
    owner: {
      id: string
      email: string
      username: string
      role: 'USER' | 'CREATOR' | 'ADMIN'
    }
    options: {
      ownerEmail: string
      sourceBaseUrl: string
      publicAssetBaseUrl: string
      dryRun: boolean
      skipDownloads: boolean
      limit: number | null
    }
    stats: {
      scanned: number
      created: number
      updated: number
      skipped: number
      downloaded: number
      personaFetched: number
      personaMissing: number
    }
    items: Array<{
      name: string
      slug: string
      action: 'create' | 'update'
      tagline: string | null
      personaStatus: 'fetched' | 'missing' | 'not-requested'
      downloadedFile: boolean
      vroidFileUrl: string
      legacyTier: number
      legacyHeyWaifu: number
    }>
  }
}

type LegacyTaglineBackfillResponse = {
  data: {
    forceUpdate: boolean
    updated: number
    skipped: number
    unresolved: number
    items: Array<{
      name: string
      previousTagline: string | null
      resolvedTagline: string | null
      status: 'updated' | 'skipped' | 'unresolved'
    }>
  }
}

const LEGACY_IMPORT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000

const getLegacyImportOverview = async () => apiGet<LegacyImportOverviewResponse>('/admin/legacy-import/overview')

const runLegacyImport = async (payload: LegacyImportRunRequest) =>
  apiPost<LegacyImportRunResponse>('/admin/legacy-import/run', payload, LEGACY_IMPORT_REQUEST_TIMEOUT_MS)

const runLegacyTaglineBackfill = async (forceUpdate = false) =>
  apiPost<LegacyTaglineBackfillResponse>(
    '/admin/legacy-import/backfill-taglines',
    { forceUpdate },
    LEGACY_IMPORT_REQUEST_TIMEOUT_MS
  )

export { getLegacyImportOverview, runLegacyImport, runLegacyTaglineBackfill }
export type {
  LegacyImportOverviewResponse,
  LegacyImportRunRequest,
  LegacyImportRunResponse,
  LegacyTaglineBackfillResponse
}
