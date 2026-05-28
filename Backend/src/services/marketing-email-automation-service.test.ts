import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMarketingEmailRecipientVariablesJsonSql,
  buildMarketingEmailTimestampSql,
  createMarketingEmailAutomation,
  processDueMarketingEmailAutomationRecipients,
  processDueMarketingEmailAutomationRecipientsAsBackgroundWork,
  resolveMarketingAutomationActivePaidMembership,
  type MarketingEmailAutomationStore
} from './marketing-email-automation-service'
import { buildMarketingSubscriptionEligibilityPredicate } from './marketing-email-automation-eligibility-query'
import { Prisma } from '@prisma/client'

type AutomationRow = Awaited<ReturnType<MarketingEmailAutomationStore['getAutomationById']>> & {}
type RecipientRow = Awaited<ReturnType<MarketingEmailAutomationStore['claimRecipient']>> & {}
type EligibleUser = Awaited<ReturnType<MarketingEmailAutomationStore['listEligibleUsers']>>[number]

const NOW = new Date('2026-05-19T10:00:00.000Z')

const inspectSql = (fragment: Prisma.Sql) => ({
  sql: fragment.sql,
  values: fragment.values
})

const makeAutomation = (overrides: Partial<NonNullable<AutomationRow>> = {}): NonNullable<AutomationRow> => ({
  id: 'automation-1',
  templateKey: 'promo_template',
  status: 'active',
  statusCondition: 'all_verified_users',
  triggerDelayHours: 0,
  triggerDelayDays: 0,
  campaignDiscountCode: 'SAVE10',
  campaignFeaturesSummary: 'More features are ready.',
  campaignCtaUrl: 'https://secretwaifu.com/members',
  sendIntervalSeconds: 60,
  maxRecipients: 20_000,
  createdAt: '2026-05-19T09:00:00.000Z',
  updatedAt: '2026-05-19T09:00:00.000Z',
  startedAt: '2026-05-19T09:00:00.000Z',
  pausedAt: null,
  ...overrides
})

const makeRecipient = (overrides: Partial<NonNullable<RecipientRow>> = {}): NonNullable<RecipientRow> => ({
  id: 'recipient-1',
  automationId: 'automation-1',
  templateKey: 'promo_template',
  recipientUserId: 'user-1',
  recipientEmail: 'user-1@example.com',
  variablesJson: JSON.stringify({ username: 'Alessandro' }),
  status: 'queued',
  attemptCount: 0,
  nextAttemptAt: '2026-05-19T09:59:00.000Z',
  subject: null,
  lastError: null,
  createdAt: '2026-05-19T09:30:00.000Z',
  updatedAt: '2026-05-19T09:30:00.000Z',
  sentAt: null,
  claimedAt: null,
  leaseOwner: null,
  leaseExpiresAt: null,
  ...overrides
})

const makeEligibleUser = (id: string): EligibleUser => ({
  id,
  email: `${id}@example.com`,
  username: id,
  daysSinceSignup: 7,
  daysSinceLastSeen: null,
  chatSessionsCount: 0,
  purchaseCount: 0,
  totalRevenueCents: 0,
  lastPurchaseAt: null
})

test('marketing recipient variables JSON raw SQL casts text into jsonb', () => {
  const variablesJson = JSON.stringify({ username: 'Alessandro' })
  const fragment = inspectSql(buildMarketingEmailRecipientVariablesJsonSql(variablesJson))

  assert.equal(fragment.sql, '?::jsonb')
  assert.deepEqual(fragment.values, [variablesJson])
})

test('marketing recipient timestamp raw SQL casts text into timestamptz', () => {
  const nextAttemptAt = '2026-05-21T15:47:10.000Z'
  const fragment = inspectSql(buildMarketingEmailTimestampSql(nextAttemptAt))

  assert.equal(fragment.sql, '?::timestamptz')
  assert.deepEqual(fragment.values, [nextAttemptAt])
})

test('marketing active subscription SQL is based on active entitlements instead of Patreon billing dates', () => {
  const fragment = inspectSql(
    buildMarketingSubscriptionEligibilityPredicate(
      'active_subscription',
      '2026-05-01T00:00:00.000Z',
      NOW.toISOString()
    )
  )

  assert.match(fragment.sql, /FROM "Entitlement" AS entitlement/)
  assert.equal(fragment.sql.includes('PatreonAccount'), false)
  assert.equal(fragment.sql.includes('nextChargeDate'), false)
})

test('marketing canceled subscription SQL excludes users with active playable entitlements', () => {
  const fragment = inspectSql(
    buildMarketingSubscriptionEligibilityPredicate(
      'canceled_subscription',
      '2026-05-01T00:00:00.000Z',
      NOW.toISOString()
    )
  )

  assert.match(fragment.sql, /NOT\s+EXISTS/)
  assert.match(fragment.sql, /FROM "Entitlement" AS entitlement/)
  assert.equal(fragment.sql.includes('PatreonAccount'), false)
  assert.equal(fragment.sql.includes('nextChargeDate'), false)
})

test('marketing hydrated membership state trusts active paid entitlements over renewal-day billing dates', () => {
  assert.equal(
    resolveMarketingAutomationActivePaidMembership({
      entitlementGrants: [{ tierCode: 'premium' }]
    }),
    true
  )
  assert.equal(
    resolveMarketingAutomationActivePaidMembership({
      entitlementGrants: []
    }),
    false
  )
})

class FakeMarketingEmailAutomationStore implements MarketingEmailAutomationStore {
  automations: NonNullable<AutomationRow>[]
  recipients: NonNullable<RecipientRow>[]
  eligibleUsers: EligibleUser[]
  lastEligibilityLimit: number | null = null
  listEligibleUsersCalls = 0

  constructor(seed: {
    automations?: NonNullable<AutomationRow>[]
    recipients?: NonNullable<RecipientRow>[]
    eligibleUsers?: EligibleUser[]
  } = {}) {
    this.automations = [...(seed.automations ?? [])]
    this.recipients = [...(seed.recipients ?? [])]
    this.eligibleUsers = [...(seed.eligibleUsers ?? [])]
  }

  async insertAutomation(row: NonNullable<AutomationRow>) {
    this.automations.push(row)
  }

  async updateAutomationStatus(input: {
    automationId: string
    status: 'active' | 'paused'
    updatedAt: string
    pausedAt: string | null
  }) {
    const automation = this.automations.find((candidate) => candidate.id === input.automationId)
    if (!automation) {
      return
    }

    automation.status = input.status
    automation.updatedAt = input.updatedAt
    automation.pausedAt = input.pausedAt
  }

  async getAutomationById(id: string) {
    return this.automations.find((automation) => automation.id === id) ?? null
  }

  async listAutomationRows() {
    return this.automations
  }

  async loadAutomationStats(automationIds: string[]) {
    const stats = new Map()

    for (const automationId of automationIds) {
      const matching = this.recipients.filter((recipient) => recipient.automationId === automationId)
      stats.set(automationId, {
        totalRecipients: matching.length,
        queued: matching.filter((recipient) => recipient.status === 'queued').length,
        sending: matching.filter((recipient) => recipient.status === 'sending').length,
        sent: matching.filter((recipient) => recipient.status === 'sent').length,
        failed: matching.filter((recipient) => recipient.status === 'failed').length
      })
    }

    return stats
  }

  async listActiveAutomations() {
    return this.automations.filter((automation) => automation.status === 'active')
  }

  async listEligibleUsers(input: { limit: number }) {
    this.listEligibleUsersCalls += 1
    this.lastEligibilityLimit = input.limit
    return this.eligibleUsers.slice(0, input.limit)
  }

  async enqueueRecipient(input: {
    automation: NonNullable<AutomationRow>
    user: EligibleUser
    variablesJson: string
    nextAttemptAt: string
    nowIso: string
  }) {
    if (
      this.recipients.some(
        (recipient) =>
          recipient.automationId === input.automation.id &&
          recipient.recipientUserId === input.user.id
      )
    ) {
      return false
    }

    this.recipients.push(makeRecipient({
      id: `recipient-${this.recipients.length + 1}`,
      automationId: input.automation.id,
      templateKey: input.automation.templateKey,
      recipientUserId: input.user.id,
      recipientEmail: input.user.email,
      variablesJson: input.variablesJson,
      nextAttemptAt: input.nextAttemptAt,
      createdAt: input.nowIso,
      updatedAt: input.nowIso
    }))
    return true
  }

  async listDueRecipients(input: { nowIso: string; batchSize: number }) {
    const nowMs = new Date(input.nowIso).getTime()
    return this.recipients
      .filter((recipient) => {
        const automation = this.automations.find((candidate) => candidate.id === recipient.automationId)
        if (automation?.status !== 'active') {
          return false
        }

        if (recipient.status === 'queued') {
          return new Date(recipient.nextAttemptAt).getTime() <= nowMs
        }

        return (
          recipient.status === 'sending' &&
          Boolean(recipient.leaseExpiresAt) &&
          new Date(recipient.leaseExpiresAt as string).getTime() <= nowMs
        )
      })
      .slice(0, input.batchSize)
  }

  async claimRecipient(input: {
    recipientId: string
    nowIso: string
    leaseOwner: string
    leaseExpiresAt: string
  }) {
    const recipient = this.recipients.find((candidate) => candidate.id === input.recipientId)
    if (!recipient) {
      return null
    }

    recipient.status = 'sending'
    recipient.attemptCount += 1
    recipient.claimedAt = input.nowIso
    recipient.leaseOwner = input.leaseOwner
    recipient.leaseExpiresAt = input.leaseExpiresAt
    recipient.updatedAt = input.nowIso
    recipient.lastError = null
    return { ...recipient }
  }

  async markRecipientSent(input: { recipientId: string; subject: string; sentAt: string }) {
    const recipient = this.recipients.find((candidate) => candidate.id === input.recipientId)
    if (!recipient) {
      throw new Error(`Missing recipient ${input.recipientId}.`)
    }

    recipient.status = 'sent'
    recipient.subject = input.subject
    recipient.sentAt = input.sentAt
    recipient.updatedAt = input.sentAt
    recipient.leaseOwner = null
    recipient.leaseExpiresAt = null
    recipient.claimedAt = null
  }

  async markRecipientFailed(input: {
    recipientId: string
    status: 'queued' | 'failed'
    nextAttemptAt: string
    lastError: string
    updatedAt: string
  }) {
    const recipient = this.recipients.find((candidate) => candidate.id === input.recipientId)
    if (!recipient) {
      throw new Error(`Missing recipient ${input.recipientId}.`)
    }

    recipient.status = input.status
    recipient.nextAttemptAt = input.nextAttemptAt
    recipient.lastError = input.lastError
    recipient.updatedAt = input.updatedAt
    recipient.leaseOwner = null
    recipient.leaseExpiresAt = null
    recipient.claimedAt = null
  }
}

const createTemplateDependencies = (overrides: {
  mailer?: { sendEmailMessage: () => Promise<void> }
  store?: MarketingEmailAutomationStore
} = {}) => ({
  store: overrides.store ?? new FakeMarketingEmailAutomationStore(),
  getEmailTemplateByKey: async () => ({
    templateKey: 'promo_template',
    name: 'Promo template'
  }),
  getRenderedEmailTemplateByKey: async () => ({
    rendered: {
      subject: 'Subject',
      text: 'Text',
      html: '<p>Text</p>'
    }
  }),
  createEmailSendLog: async () => undefined,
  mailer: overrides.mailer ?? {
    sendEmailMessage: async () => undefined
  }
})

test('createMarketingEmailAutomation persists the automation without synchronously enqueueing recipients', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    eligibleUsers: [makeEligibleUser('user-1')]
  })

  const result = await createMarketingEmailAutomation({
    templateKey: 'promo_template',
    statusCondition: 'all_verified_users',
    triggerDelayDays: 0,
    campaignFeaturesSummary: 'More features are ready.',
    campaignCtaUrl: 'https://secretwaifu.com/members'
  }, createTemplateDependencies({ store }))

  assert.equal(store.automations.length, 1)
  assert.equal(store.automations[0].triggerDelayHours, 0)
  assert.equal(store.listEligibleUsersCalls, 0)
  assert.deepEqual(result.enqueueResult, {
    eligible: 0,
    queued: 0,
    deferred: true
  })
})

test('createMarketingEmailAutomation stores hour-level trigger delays', async () => {
  const store = new FakeMarketingEmailAutomationStore()

  await createMarketingEmailAutomation({
    templateKey: 'promo_template',
    statusCondition: 'verified_no_subscription',
    triggerDelayHours: 6,
    campaignFeaturesSummary: 'More features are ready.',
    campaignCtaUrl: 'https://secretwaifu.com/members'
  }, createTemplateDependencies({ store }))

  assert.equal(store.automations[0].triggerDelayHours, 6)
  assert.equal(store.automations[0].triggerDelayDays, 0)
})

test('processDueMarketingEmailAutomationRecipients bounds each enqueue pass', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    automations: [makeAutomation({ maxRecipients: 10 })],
    eligibleUsers: [
      makeEligibleUser('user-1'),
      makeEligibleUser('user-2'),
      makeEligibleUser('user-3')
    ]
  })

  const result = await processDueMarketingEmailAutomationRecipients({
    ...createTemplateDependencies({ store }),
    store,
    now: NOW,
    batchSize: 5,
    enqueueBatchSize: 2
  })

  assert.equal(store.lastEligibilityLimit, 2)
  assert.equal(store.recipients.length, 2)
  assert.equal(result.eligibleCandidates, 2)
  assert.equal(result.enqueued, 2)
  assert.equal(result.queueInsertSkipped, 0)
})

test('processDueMarketingEmailAutomationRecipients reports idempotent queue insert skips', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    automations: [makeAutomation({ maxRecipients: 10 })],
    recipients: [
      makeRecipient({
        recipientUserId: 'user-1',
        status: 'sent'
      })
    ],
    eligibleUsers: [makeEligibleUser('user-1')]
  })

  const result = await processDueMarketingEmailAutomationRecipients({
    ...createTemplateDependencies({ store }),
    store,
    now: NOW,
    batchSize: 5,
    enqueueBatchSize: 1
  })

  assert.equal(result.eligibleCandidates, 1)
  assert.equal(result.enqueued, 0)
  assert.equal(result.queueInsertSkipped, 1)
})

test('processDueMarketingEmailAutomationRecipientsAsBackgroundWork runs through the generic background monitor', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    automations: [makeAutomation()],
    eligibleUsers: [makeEligibleUser('user-1')]
  })
  const observedOperations: string[] = []

  const result = await processDueMarketingEmailAutomationRecipientsAsBackgroundWork({
    ...createTemplateDependencies({ store }),
    store,
    enqueueBatchSize: 1,
    runObservedBackgroundWork: async (operationName, work) => {
      observedOperations.push(operationName)
      return work()
    }
  })

  assert.deepEqual(observedOperations, ['marketing_email_automation_queue'])
  assert.equal(result.enqueued, 1)
  assert.equal('skippedByGate' in result, false)
})

test('processDueMarketingEmailAutomationRecipientsAsBackgroundWork warns when eligible candidates only hit idempotent insert skips', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    automations: [makeAutomation({ maxRecipients: 10 })],
    recipients: [
      makeRecipient({
        recipientUserId: 'user-1',
        status: 'sent'
      })
    ],
    eligibleUsers: [makeEligibleUser('user-1')]
  })
  const warnings: unknown[][] = []

  const result = await processDueMarketingEmailAutomationRecipientsAsBackgroundWork({
    ...createTemplateDependencies({ store }),
    store,
    enqueueBatchSize: 1,
    runObservedBackgroundWork: async (_operationName, work) => work(),
    logger: {
      error: () => undefined,
      warn: (...args: unknown[]) => {
        warnings.push(args)
      }
    }
  })

  assert.equal(result.eligibleCandidates, 1)
  assert.equal(result.enqueued, 0)
  assert.equal(result.queueInsertSkipped, 1)
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0][0]), /selected eligible candidates but inserted no queue recipients/)
  assert.equal(JSON.stringify(warnings).includes('user-1'), false)
})

test('processDueMarketingEmailAutomationRecipients reclaims expired sending recipients', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    automations: [makeAutomation()],
    recipients: [
      makeRecipient({
        status: 'sending',
        attemptCount: 1,
        leaseOwner: 'dead-worker',
        leaseExpiresAt: '2026-05-19T09:58:00.000Z',
        claimedAt: '2026-05-19T09:55:00.000Z'
      })
    ]
  })

  const result = await processDueMarketingEmailAutomationRecipients({
    ...createTemplateDependencies({ store }),
    store,
    now: NOW,
    leaseOwner: 'live-worker',
    batchSize: 1,
    enqueueBatchSize: 0
  })

  assert.equal(result.sent, 1)
  assert.equal(store.recipients[0].status, 'sent')
  assert.equal(store.recipients[0].leaseOwner, null)
  assert.equal(store.recipients[0].leaseExpiresAt, null)
})

test('processDueMarketingEmailAutomationRecipients releases transient send failures for retry', async () => {
  const store = new FakeMarketingEmailAutomationStore({
    automations: [makeAutomation()],
    recipients: [makeRecipient()]
  })

  const result = await processDueMarketingEmailAutomationRecipients({
    ...createTemplateDependencies({
      store,
      mailer: {
        sendEmailMessage: async () => {
          throw new Error('SMTP timeout while sending.')
        }
      }
    }),
    store,
    now: NOW,
    batchSize: 1,
    enqueueBatchSize: 0
  })

  assert.equal(result.retryScheduled, 1)
  assert.equal(store.recipients[0].status, 'queued')
  assert.equal(store.recipients[0].leaseOwner, null)
  assert.equal(store.recipients[0].lastError, 'Error')
  assert.equal(new Date(store.recipients[0].nextAttemptAt).getTime() > NOW.getTime(), true)
})
