import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyEpochPeriodBounds, resolveInitialQuotaPeriodBounds } from './chat-quota-period-service'
import { buildQuotaDeniedDetails } from './chat-quota-service'

test('resolveInitialQuotaPeriodBounds preserves epoch buckets when no Patreon period exists', () => {
  const now = new Date('2026-05-08T12:00:00.000Z')
  const expected = legacyEpochPeriodBounds(30, now)

  const actual = resolveInitialQuotaPeriodBounds({
    periodDays: 30,
    now,
    patreon: null
  })

  assert.equal(actual.periodStart.toISOString(), expected.periodStart.toISOString())
  assert.equal(actual.periodEnd.toISOString(), expected.periodEnd.toISOString())
})

test('resolveInitialQuotaPeriodBounds uses Patreon last and next charge dates when both are usable', () => {
  const now = new Date('2026-05-08T12:00:00.000Z')
  const actual = resolveInitialQuotaPeriodBounds({
    periodDays: 30,
    now,
    patreon: {
      membershipStatus: 'active_patron',
      tierCents: 500,
      lastChargeDate: new Date('2026-05-01T00:00:00.000Z'),
      nextChargeDate: new Date('2026-06-01T00:00:00.000Z')
    }
  })

  assert.equal(actual.periodStart.toISOString(), '2026-05-01T00:00:00.000Z')
  assert.equal(actual.periodEnd.toISOString(), '2026-06-01T00:00:00.000Z')
})

test('resolveInitialQuotaPeriodBounds derives a start from next charge when Patreon omits last charge', () => {
  const now = new Date('2026-05-20T12:00:00.000Z')
  const actual = resolveInitialQuotaPeriodBounds({
    periodDays: 30,
    now,
    patreon: {
      membershipStatus: 'active_patron',
      tierCents: 500,
      lastChargeDate: null,
      nextChargeDate: new Date('2026-06-01T00:00:00.000Z')
    }
  })

  assert.equal(actual.periodStart.toISOString(), '2026-05-02T00:00:00.000Z')
  assert.equal(actual.periodEnd.toISOString(), '2026-06-01T00:00:00.000Z')
})

test('quota denied details keep quota kind and snapshot machine-readable', () => {
  const quota = {
    allowed: false,
    exhaustion_reason: 'message_quota_exhausted',
    can_send_text: false,
    can_generate_voice: false
  }

  assert.deepEqual(buildQuotaDeniedDetails('text', quota), {
    quota_kind: 'text',
    quota
  })
})
