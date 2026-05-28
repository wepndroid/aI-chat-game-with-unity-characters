import test from 'node:test'
import assert from 'node:assert/strict'

import {
  processChatCommitBackgroundWork,
  type ChatCommitBackgroundWorkResult
} from './chat-commit-background-work-service'

const createBaseInput = (overrides: Partial<Parameters<typeof processChatCommitBackgroundWork>[0]> = {}) => ({
  pendingTurnId: 'pending-turn-1',
  sessionId: 'session-1',
  postCommitMessageIds: ['message-user-1', 'message-assistant-1'],
  prismaClient: {} as never,
  ...overrides
})

test('processChatCommitBackgroundWork runs both post-commit processors inside one observed worker tick', async () => {
  const calls: string[] = []

  const result = await processChatCommitBackgroundWork(createBaseInput({
    runObservedBackgroundWork: async (operationName, work) => {
      calls.push(`monitor:${operationName}`)
      return work()
    },
    processCharacterActivityMessageLedgerRows: async (_prismaClient, input) => {
      calls.push(`activity:${input?.messageIds?.join(',')}`)
      return {
        processedMessageCount: 2,
        completedChatCounted: true
      }
    },
    processDueChatSessionPreviewRefreshJobs: async (input) => {
      calls.push(`preview:${input?.batchSize}:${input?.leaseOwner}`)
      return {
        inspectedJobs: 1,
        claimedJobs: 1,
        succeededJobs: 1,
        retryScheduledJobs: 0,
        failedJobs: 0,
        skippedJobs: 0
      }
    }
  }))

  assert.equal(result.status, 'completed')
  assert.deepEqual(calls, [
    'monitor:chat_commit_post_response_effects',
    'activity:message-user-1,message-assistant-1',
    'preview:5:commit-route-pending-turn-1'
  ])
  assert.deepEqual((result as Extract<ChatCommitBackgroundWorkResult, { status: 'completed' }>).characterActivity, {
    status: 'succeeded',
    value: {
      processedMessageCount: 2,
      completedChatCounted: true
    }
  })
})

test('processChatCommitBackgroundWork has no database-gate skip branch', async () => {
  let activityCalled = false
  let previewCalled = false

  const result = await processChatCommitBackgroundWork(createBaseInput({
    runObservedBackgroundWork: async (_operationName, work) => work(),
    processCharacterActivityMessageLedgerRows: async () => {
      activityCalled = true
      return {
        processedMessageCount: 1,
        completedChatCounted: true
      }
    },
    processDueChatSessionPreviewRefreshJobs: async () => {
      previewCalled = true
      return {
        inspectedJobs: 1,
        claimedJobs: 1,
        succeededJobs: 1,
        retryScheduledJobs: 0,
        failedJobs: 0,
        skippedJobs: 0
      }
    }
  }))

  assert.equal(result.status, 'completed')
  assert.equal(activityCalled, true)
  assert.equal(previewCalled, true)
})

test('processChatCommitBackgroundWork continues preview refresh after nonfatal activity failure', async () => {
  const logEntries: unknown[] = []
  const calls: string[] = []

  const result = await processChatCommitBackgroundWork(createBaseInput({
    logger: {
      error: (...args: unknown[]) => logEntries.push(args),
      warn: () => undefined
    },
    runObservedBackgroundWork: async (_operationName, work) => work(),
    processCharacterActivityMessageLedgerRows: async () => {
      calls.push('activity')
      throw Object.assign(new Error('database timed out while handling message content'), { code: 'P1008' })
    },
    processDueChatSessionPreviewRefreshJobs: async () => {
      calls.push('preview')
      return {
        inspectedJobs: 1,
        claimedJobs: 1,
        succeededJobs: 1,
        retryScheduledJobs: 0,
        failedJobs: 0,
        skippedJobs: 0
      }
    }
  }))

  assert.equal(result.status, 'completed')
  assert.deepEqual(calls, ['activity', 'preview'])
  assert.equal(
    (result as Extract<ChatCommitBackgroundWorkResult, { status: 'completed' }>).characterActivity.status,
    'failed'
  )
  assert.equal(
    (result as Extract<ChatCommitBackgroundWorkResult, { status: 'completed' }>).previewRefresh.status,
    'succeeded'
  )
  assert.equal(logEntries.length, 1)
  assert.equal(JSON.stringify(logEntries).includes('database timed out while handling message content'), false)
})

test('processChatCommitBackgroundWork reports fatal activity panic and does not start preview refresh', async () => {
  const calls: string[] = []
  const fatalReports: unknown[] = []
  const fatalError = Object.assign(new Error('PANIC in query-engine/query-structure/src/record.rs:69:46'), {
    name: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })

  const result = await processChatCommitBackgroundWork(createBaseInput({
    runObservedBackgroundWork: async (_operationName, work) => work(),
    fatalReporter: (input) => {
      fatalReports.push(input)
      return {
        reason: 'prisma_engine_panic',
        errorName: 'PrismaClientRustPanicError',
        clientVersion: '6.19.0'
      }
    },
    processCharacterActivityMessageLedgerRows: async () => {
      calls.push('activity')
      throw fatalError
    },
    processDueChatSessionPreviewRefreshJobs: async () => {
      calls.push('preview')
      return {
        inspectedJobs: 1,
        claimedJobs: 1,
        succeededJobs: 1,
        retryScheduledJobs: 0,
        failedJobs: 0,
        skippedJobs: 0
      }
    }
  }))

  assert.equal(result.status, 'completed')
  assert.deepEqual(calls, ['activity'])
  assert.equal(fatalReports.length, 1)
  assert.deepEqual(
    (result as Extract<ChatCommitBackgroundWorkResult, { status: 'completed' }>).previewRefresh,
    {
      status: 'not_started_after_fatal'
    }
  )
})
