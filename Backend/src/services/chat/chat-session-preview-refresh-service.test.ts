import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ChatMessageRole,
  ChatSessionPreviewRefreshJobStatus
} from '@prisma/client'

import {
  CHAT_SESSION_PREVIEW_MAX_ATTEMPTS,
  MAX_SESSION_PREVIEW_CHARS,
  enqueueChatSessionPreviewRefreshJob,
  processDueChatSessionPreviewRefreshJobs,
  processDueChatSessionPreviewRefreshJobsAsBackgroundWork
} from './chat-session-preview-refresh-service'

type PreviewJobRow = {
  id: string
  sessionId: string
  pendingTurnId: string
  userMessageId: string
  assistantMessageId: string
  status: ChatSessionPreviewRefreshJobStatus
  attemptCount: number
  nextAttemptAt: Date
  lastAttemptAt: Date | null
  processedAt: Date | null
  leaseOwner: string | null
  leaseExpiresAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

type MessageRow = {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  createdAt: Date
}

type SessionRow = {
  id: string
  previewText: string | null
  lastUpdatedAt: Date
}

type PreviewDbSeed = {
  jobs?: PreviewJobRow[]
  messages?: MessageRow[]
  sessions?: SessionRow[]
  sessionUpdateError?: unknown
}

const cloneDate = (date: Date | null) => date ? new Date(date) : null

const makeJob = (overrides: Partial<PreviewJobRow> = {}): PreviewJobRow => ({
  id: 'job-1',
  sessionId: 'session-1',
  pendingTurnId: 'pending-turn-1',
  userMessageId: 'message-user-1',
  assistantMessageId: 'message-assistant-1',
  status: ChatSessionPreviewRefreshJobStatus.PENDING,
  attemptCount: 0,
  nextAttemptAt: new Date('2026-05-18T08:00:00.000Z'),
  lastAttemptAt: null,
  processedAt: null,
  leaseOwner: null,
  leaseExpiresAt: null,
  lastError: null,
  createdAt: new Date('2026-05-18T08:00:00.000Z'),
  updatedAt: new Date('2026-05-18T08:00:00.000Z'),
  ...overrides
})

const applyData = (target: Record<string, unknown>, data: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === 'object' &&
      'increment' in value &&
      typeof (value as { increment?: unknown }).increment === 'number'
    ) {
      target[key] = Number(target[key] ?? 0) + (value as { increment: number }).increment
      continue
    }

    target[key] = value
  }
}

const matchesDateFilter = (value: Date | null, filter: { lte?: Date } | undefined) => {
  if (!filter) {
    return true
  }

  if (filter.lte && (!value || value.getTime() > filter.lte.getTime())) {
    return false
  }

  return true
}

const matchesJobWhere = (job: PreviewJobRow, where: Record<string, unknown> = {}): boolean => {
  if (where.id && job.id !== where.id) {
    return false
  }

  if (where.status && job.status !== where.status) {
    return false
  }

  if (!matchesDateFilter(job.nextAttemptAt, where.nextAttemptAt as { lte?: Date } | undefined)) {
    return false
  }

  if (!matchesDateFilter(job.leaseExpiresAt, where.leaseExpiresAt as { lte?: Date } | undefined)) {
    return false
  }

  const disjunction = where.OR as Record<string, unknown>[] | undefined
  if (disjunction && !disjunction.some((condition) => matchesJobWhere(job, condition))) {
    return false
  }

  return true
}

const createPreviewDb = (seed: PreviewDbSeed = {}) => {
  const jobs = [...(seed.jobs ?? [])]
  const messages = [...(seed.messages ?? [])]
  const sessions = new Map<string, SessionRow>((seed.sessions ?? []).map((session) => [session.id, { ...session }]))

  const db = {
    jobs,
    messages,
    sessions,
    chatSessionPreviewRefreshJob: {
      upsert: async (input: {
        where: { userMessageId: string }
        create: Omit<PreviewJobRow, 'id' | 'attemptCount' | 'lastAttemptAt' | 'processedAt' | 'leaseOwner' | 'leaseExpiresAt' | 'lastError' | 'createdAt' | 'updatedAt'> & Partial<PreviewJobRow>
        update: Partial<PreviewJobRow>
      }) => {
        const existing = jobs.find((job) => job.userMessageId === input.where.userMessageId)
        if (existing) {
          applyData(existing as unknown as Record<string, unknown>, input.update as Record<string, unknown>)
          return existing
        }

        const now = new Date('2026-05-18T08:00:00.000Z')
        const created = makeJob({
          id: `job-${jobs.length + 1}`,
          ...input.create,
          attemptCount: input.create.attemptCount ?? 0,
          lastAttemptAt: cloneDate(input.create.lastAttemptAt ?? null),
          processedAt: cloneDate(input.create.processedAt ?? null),
          leaseOwner: input.create.leaseOwner ?? null,
          leaseExpiresAt: cloneDate(input.create.leaseExpiresAt ?? null),
          lastError: input.create.lastError ?? null,
          createdAt: input.create.createdAt ?? now,
          updatedAt: input.create.updatedAt ?? now
        })
        jobs.push(created)
        return created
      },
      findMany: async (input: { where?: Record<string, unknown>; take?: number }) => {
        return jobs.filter((job) => matchesJobWhere(job, input.where)).slice(0, input.take ?? jobs.length)
      },
      updateMany: async (input: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0
        for (const job of jobs) {
          if (!matchesJobWhere(job, input.where)) {
            continue
          }

          applyData(job as unknown as Record<string, unknown>, input.data)
          count += 1
        }
        return { count }
      },
      findUnique: async (input: { where: { id: string } }) => jobs.find((job) => job.id === input.where.id) ?? null,
      update: async (input: { where: { id: string }; data: Record<string, unknown> }) => {
        const job = jobs.find((candidate) => candidate.id === input.where.id)
        if (!job) {
          throw new Error(`Missing preview refresh job ${input.where.id}.`)
        }

        applyData(job as unknown as Record<string, unknown>, input.data)
        return job
      }
    },
    chatMessage: {
      findFirst: async (input: {
        where: { id: string; sessionId: string; role: ChatMessageRole }
        select: { content: true; createdAt: true }
      }) => {
        const message = messages.find(
          (candidate) =>
            candidate.id === input.where.id &&
            candidate.sessionId === input.where.sessionId &&
            candidate.role === input.where.role
        )
        return message
          ? {
              content: message.content,
              createdAt: message.createdAt
            }
          : null
      }
    },
    chatSession: {
      update: async (input: { where: { id: string }; data: { previewText: string; lastUpdatedAt: Date } }) => {
        if (seed.sessionUpdateError) {
          throw seed.sessionUpdateError
        }

        const session = sessions.get(input.where.id)
        if (!session) {
          throw new Error(`Missing session ${input.where.id}.`)
        }

        session.previewText = input.data.previewText
        session.lastUpdatedAt = input.data.lastUpdatedAt
        return session
      }
    }
  }

  return db
}

test('enqueueChatSessionPreviewRefreshJob creates one pending job per user message', async () => {
  const db = createPreviewDb()

  await enqueueChatSessionPreviewRefreshJob(db as never, {
    sessionId: 'session-1',
    pendingTurnId: 'pending-turn-1',
    userMessageId: 'message-user-1',
    assistantMessageId: 'message-assistant-1'
  })
  await enqueueChatSessionPreviewRefreshJob(db as never, {
    sessionId: 'session-1',
    pendingTurnId: 'pending-turn-1',
    userMessageId: 'message-user-1',
    assistantMessageId: 'message-assistant-1'
  })

  assert.equal(db.jobs.length, 1)
  assert.equal(db.jobs[0].status, ChatSessionPreviewRefreshJobStatus.PENDING)
  assert.equal(db.jobs[0].attemptCount, 0)
  assert.equal(db.jobs[0].sessionId, 'session-1')
  assert.equal(db.jobs[0].userMessageId, 'message-user-1')
})

test('processDueChatSessionPreviewRefreshJobs updates preview from the committed user message timestamp', async () => {
  const userMessageCreatedAt = new Date('2026-05-18T08:01:30.000Z')
  const processedAt = new Date('2026-05-18T08:02:00.000Z')
  const db = createPreviewDb({
    jobs: [makeJob()],
    messages: [
      {
        id: 'message-user-1',
        sessionId: 'session-1',
        role: ChatMessageRole.USER,
        content: 'A'.repeat(MAX_SESSION_PREVIEW_CHARS + 15),
        createdAt: userMessageCreatedAt
      }
    ],
    sessions: [
      {
        id: 'session-1',
        previewText: null,
        lastUpdatedAt: new Date('2026-05-18T07:59:00.000Z')
      }
    ]
  })

  const result = await processDueChatSessionPreviewRefreshJobs({
    db: db as never,
    batchSize: 1,
    leaseOwner: 'test-worker',
    now: () => processedAt
  })

  assert.equal(result.claimedJobs, 1)
  assert.equal(result.succeededJobs, 1)
  assert.equal(db.sessions.get('session-1')?.previewText, 'A'.repeat(MAX_SESSION_PREVIEW_CHARS))
  assert.deepEqual(db.sessions.get('session-1')?.lastUpdatedAt, userMessageCreatedAt)
  assert.equal(db.jobs[0].status, ChatSessionPreviewRefreshJobStatus.SUCCEEDED)
  assert.deepEqual(db.jobs[0].processedAt, processedAt)
  assert.equal(db.jobs[0].leaseOwner, null)
  assert.equal(db.jobs[0].leaseExpiresAt, null)
})

test('processDueChatSessionPreviewRefreshJobs schedules retry for transient database pressure', async () => {
  const db = createPreviewDb({
    jobs: [makeJob()],
    messages: [
      {
        id: 'message-user-1',
        sessionId: 'session-1',
        role: ChatMessageRole.USER,
        content: 'Hello',
        createdAt: new Date('2026-05-18T08:01:30.000Z')
      }
    ],
    sessions: [
      {
        id: 'session-1',
        previewText: null,
        lastUpdatedAt: new Date('2026-05-18T07:59:00.000Z')
      }
    ],
    sessionUpdateError: {
      code: 'P1008',
      message: 'Socket timeout after seeing Hello and sw_session=secret-token'
    }
  })

  const result = await processDueChatSessionPreviewRefreshJobs({
    db: db as never,
    batchSize: 1,
    leaseOwner: 'test-worker',
    now: () => new Date('2026-05-18T08:02:00.000Z')
  })

  assert.equal(result.retryScheduledJobs, 1)
  assert.equal(db.jobs[0].status, ChatSessionPreviewRefreshJobStatus.PENDING)
  assert.equal(db.jobs[0].attemptCount, 1)
  assert.equal(db.jobs[0].lastError, 'prisma_query_timeout')
  assert.equal(db.jobs[0].leaseOwner, null)
  assert.equal(db.jobs[0].leaseExpiresAt, null)
  assert.equal(db.jobs[0].nextAttemptAt.getTime() > new Date('2026-05-18T08:02:00.000Z').getTime(), true)
})

test('processDueChatSessionPreviewRefreshJobs terminally fails exhausted jobs with sanitized errors', async () => {
  const db = createPreviewDb({
    jobs: [
      makeJob({
        attemptCount: CHAT_SESSION_PREVIEW_MAX_ATTEMPTS - 1
      })
    ],
    messages: [
      {
        id: 'message-user-1',
        sessionId: 'session-1',
        role: ChatMessageRole.USER,
        content: 'Hello',
        createdAt: new Date('2026-05-18T08:01:30.000Z')
      }
    ],
    sessions: [
      {
        id: 'session-1',
        previewText: null,
        lastUpdatedAt: new Date('2026-05-18T07:59:00.000Z')
      }
    ],
    sessionUpdateError: Object.assign(
      new Error('Socket timeout after seeing Hello, sw_session=secret-token, SELECT * FROM private'),
      {
        code: 'P1008'
      }
    )
  })

  const result = await processDueChatSessionPreviewRefreshJobs({
    db: db as never,
    batchSize: 1,
    leaseOwner: 'test-worker',
    now: () => new Date('2026-05-18T08:02:00.000Z')
  })

  assert.equal(result.failedJobs, 1)
  assert.equal(db.jobs[0].status, ChatSessionPreviewRefreshJobStatus.FAILED)
  assert.equal(db.jobs[0].attemptCount, CHAT_SESSION_PREVIEW_MAX_ATTEMPTS)
  assert.equal(db.jobs[0].lastError, 'prisma_query_timeout')

  const serializedJob = JSON.stringify(db.jobs[0])
  assert.equal(serializedJob.includes('Hello'), false)
  assert.equal(serializedJob.includes('sw_session'), false)
  assert.equal(serializedJob.includes('SELECT * FROM private'), false)
})

test('processDueChatSessionPreviewRefreshJobsAsBackgroundWork runs through the generic background monitor', async () => {
  const db = createPreviewDb({
    jobs: [makeJob()]
  })
  const observedOperations: string[] = []

  const result = await processDueChatSessionPreviewRefreshJobsAsBackgroundWork({
    db: db as never,
    runObservedBackgroundWork: async (operationName, work) => {
      observedOperations.push(operationName)
      return work()
    }
  })

  assert.equal(result.inspectedJobs, 1)
  assert.equal(result.claimedJobs, 1)
  assert.equal(result.failedJobs, 1)
  assert.equal('skippedByGate' in result, false)
  assert.deepEqual(observedOperations, ['chat_session_preview_refresh'])
  assert.equal(db.jobs[0].status, ChatSessionPreviewRefreshJobStatus.FAILED)
})
