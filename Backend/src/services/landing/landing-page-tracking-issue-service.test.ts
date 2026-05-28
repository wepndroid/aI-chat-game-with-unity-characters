import assert from 'node:assert/strict'
import test from 'node:test'

import { recordLandingPageTrackingIssue } from './landing-page-tracking-issue-service'

type StoredIssue = {
  fingerprint: string
  kind: string
  landingPageKey: string | null
  variantKey: string | null
  routePath: string | null
  shortUrlKey: string | null
  firstSeenAt: Date
  lastSeenAt: Date
  seenCount: number
}

const createIssueDb = () => {
  const records = new Map<string, StoredIssue>()

  return {
    records,
    db: {
      landingPageTrackingIssue: {
        upsert: async (query: {
          where: { fingerprint: string }
          create: StoredIssue
          update: { lastSeenAt: Date; seenCount: { increment: number } }
        }) => {
          const existing = records.get(query.where.fingerprint)

          if (!existing) {
            records.set(query.where.fingerprint, {
              ...query.create
            })
            return query.create
          }

          existing.lastSeenAt = query.update.lastSeenAt
          existing.seenCount += query.update.seenCount.increment
          return existing
        }
      }
    }
  }
}

test('recordLandingPageTrackingIssue aggregates repeated sanitized fingerprints', async () => {
  const { db, records } = createIssueDb()
  const firstSeenAt = new Date('2026-05-14T12:00:00.000Z')
  const lastSeenAt = new Date('2026-05-14T12:05:00.000Z')

  await recordLandingPageTrackingIssue(
    {
      kind: 'UNKNOWN_VARIANT',
      landingPageKey: ' LP Chat ',
      variantKey: 'Not Configured',
      routePath: '/lp-chat?token=secret#anchor',
      shortUrlKey: 'Paid Link'
    },
    {
      db: db as never,
      now: firstSeenAt
    }
  )
  await recordLandingPageTrackingIssue(
    {
      kind: 'UNKNOWN_VARIANT',
      landingPageKey: 'lp-chat',
      variantKey: 'not-configured',
      routePath: '/lp-chat',
      shortUrlKey: 'paid-link'
    },
    {
      db: db as never,
      now: lastSeenAt
    }
  )

  assert.equal(records.size, 1)
  const [record] = [...records.values()]
  assert.equal(record.kind, 'UNKNOWN_VARIANT')
  assert.equal(record.landingPageKey, 'lp-chat')
  assert.equal(record.variantKey, 'not-configured')
  assert.equal(record.routePath, '/lp-chat')
  assert.equal(record.shortUrlKey, 'paid-link')
  assert.equal(record.seenCount, 2)
  assert.equal(record.firstSeenAt.toISOString(), firstSeenAt.toISOString())
  assert.equal(record.lastSeenAt.toISOString(), lastSeenAt.toISOString())
  assert.equal(JSON.stringify(record).includes('secret'), false)
})

test('recordLandingPageTrackingIssue bounds attacker-controlled fields before persistence', async () => {
  const { db, records } = createIssueDb()

  await recordLandingPageTrackingIssue(
    {
      kind: 'UNKNOWN_LANDING_PAGE',
      landingPageKey: `landing-${'x'.repeat(200)}`,
      variantKey: `variant-${'y'.repeat(200)}`,
      routePath: `/${'z'.repeat(400)}`,
      shortUrlKey: `short-${'q'.repeat(200)}`
    },
    {
      db: db as never,
      now: new Date('2026-05-14T12:00:00.000Z')
    }
  )

  const [record] = [...records.values()]
  assert.equal(record.landingPageKey?.length, 80)
  assert.equal(record.variantKey?.length, 80)
  assert.equal(record.routePath?.length, 255)
  assert.equal(record.shortUrlKey?.length, 80)
})
