import { createHash } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import {
  normalizeLandingPageKey,
  normalizeLandingPagePath
} from './landing-page-paths'

type LandingPageTrackingIssueKind =
  | 'UNKNOWN_LANDING_PAGE'
  | 'INACTIVE_LANDING_PAGE'
  | 'UNKNOWN_VARIANT'
  | 'MISSING_CONTROL_VARIANT'

/**
 * Public tracking mismatch that should be visible to admins.
 * Values come from untrusted requests and are normalized again before storage.
 */
type LandingPageTrackingIssueInput = {
  kind: LandingPageTrackingIssueKind
  landingPageKey?: string | null
  variantKey?: string | null
  routePath?: string | null
  shortUrlKey?: string | null
}

/**
 * Bounded representation persisted in `LandingPageTrackingIssue`.
 * It intentionally stores only repair dimensions, not cookies, raw request
 * bodies, full URLs, or user agents.
 */
type NormalizedLandingPageTrackingIssue = {
  kind: LandingPageTrackingIssueKind
  landingPageKey: string | null
  variantKey: string | null
  routePath: string | null
  shortUrlKey: string | null
}

type LandingPageTrackingIssueRecord = NormalizedLandingPageTrackingIssue & {
  id: string
  fingerprint: string
  firstSeenAt: Date
  lastSeenAt: Date
  seenCount: number
}

/**
 * Narrow persistence port for issue aggregation.
 * Tests provide this port to prove repeated public noise aggregates by
 * fingerprint instead of creating unbounded diagnostic rows.
 */
type LandingPageTrackingIssueDatabase = {
  landingPageTrackingIssue: {
    upsert: (input: unknown) => Promise<unknown>
    findMany: (input: unknown) => Promise<LandingPageTrackingIssueRecord[]>
  }
}

type LandingPageTrackingIssueServiceOptions = {
  db?: LandingPageTrackingIssueDatabase
  now?: Date
  warn?: (message: string, details: Record<string, string>) => void
}

const DEFAULT_ISSUE_LIST_LIMIT = 100
const LANDING_PAGE_KEY_LENGTH = 80
const LANDING_PAGE_PATH_LENGTH = 255

// Issue dimensions are sanitized independently from route validation because
// they cross a trust boundary and are stored for operational visibility.
const normalizeIssueKey = (value: string | null | undefined) => normalizeLandingPageKey(value, '') || null

const normalizeIssuePath = (value: string | null | undefined) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  return normalizeLandingPagePath(value)
}

const normalizeLandingPageTrackingIssue = (input: LandingPageTrackingIssueInput): NormalizedLandingPageTrackingIssue => ({
  kind: input.kind,
  landingPageKey: normalizeIssueKey(input.landingPageKey)?.slice(0, LANDING_PAGE_KEY_LENGTH) ?? null,
  variantKey: normalizeIssueKey(input.variantKey)?.slice(0, LANDING_PAGE_KEY_LENGTH) ?? null,
  routePath: normalizeIssuePath(input.routePath)?.slice(0, LANDING_PAGE_PATH_LENGTH) ?? null,
  shortUrlKey: normalizeIssueKey(input.shortUrlKey)?.slice(0, LANDING_PAGE_KEY_LENGTH) ?? null
})

/**
 * Builds the stable aggregation key for repeated mismatch events.
 * A hash keeps the unique index compact while preserving the readable
 * normalized dimensions in separate columns for admin review.
 */
const buildLandingPageTrackingIssueFingerprint = (issue: NormalizedLandingPageTrackingIssue) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        kind: issue.kind,
        landingPageKey: issue.landingPageKey,
        variantKey: issue.variantKey,
        routePath: issue.routePath,
        shortUrlKey: issue.shortUrlKey
      })
    )
    .digest('hex')

/**
 * Persists a bounded, aggregated diagnostic for public tracking payloads that
 * do not match the admin-owned landing-page catalog. This telemetry is
 * intentionally fail-open: broken diagnostics must not break public traffic.
 */
const recordLandingPageTrackingIssue = async (
  input: LandingPageTrackingIssueInput,
  options?: LandingPageTrackingIssueServiceOptions
) => {
  const db = options?.db ?? (prisma as unknown as LandingPageTrackingIssueDatabase)
  const now = options?.now ?? new Date()
  const issue = normalizeLandingPageTrackingIssue(input)
  const fingerprint = buildLandingPageTrackingIssueFingerprint(issue)

  try {
    return await db.landingPageTrackingIssue.upsert({
      where: {
        fingerprint
      },
      update: {
        lastSeenAt: now,
        seenCount: {
          increment: 1
        }
      },
      create: {
        fingerprint,
        kind: issue.kind,
        landingPageKey: issue.landingPageKey,
        variantKey: issue.variantKey,
        routePath: issue.routePath,
        shortUrlKey: issue.shortUrlKey,
        firstSeenAt: now,
        lastSeenAt: now,
        seenCount: 1
      }
    })
  } catch (error) {
    const warn = options?.warn ?? ((message: string, details: Record<string, string>) => console.warn(message, details))
    warn('[landing] Tracking issue persistence failed; continuing fail-open.', {
      kind: issue.kind,
      errorName: error instanceof Error ? error.name : typeof error
    })
    return null
  }
}

/**
 * Lists the most recent aggregated tracking mismatches for the admin UI.
 * This is intentionally read-only; repair still happens through the normal
 * landing-page editor after an admin reviews the mismatch.
 */
const listLandingPageTrackingIssues = async (options?: {
  db?: LandingPageTrackingIssueDatabase
  limit?: number
}) => {
  const db = options?.db ?? (prisma as unknown as LandingPageTrackingIssueDatabase)
  const take = Math.min(Math.max(options?.limit ?? DEFAULT_ISSUE_LIST_LIMIT, 1), DEFAULT_ISSUE_LIST_LIMIT)

  return db.landingPageTrackingIssue.findMany({
    orderBy: [
      {
        lastSeenAt: 'desc'
      },
      {
        seenCount: 'desc'
      }
    ],
    take,
    select: {
      id: true,
      fingerprint: true,
      kind: true,
      landingPageKey: true,
      variantKey: true,
      routePath: true,
      shortUrlKey: true,
      firstSeenAt: true,
      lastSeenAt: true,
      seenCount: true
    }
  })
}

export {
  buildLandingPageTrackingIssueFingerprint,
  listLandingPageTrackingIssues,
  normalizeLandingPageTrackingIssue,
  recordLandingPageTrackingIssue
}
export type {
  LandingPageTrackingIssueDatabase,
  LandingPageTrackingIssueInput,
  LandingPageTrackingIssueKind,
  LandingPageTrackingIssueRecord,
  NormalizedLandingPageTrackingIssue
}
