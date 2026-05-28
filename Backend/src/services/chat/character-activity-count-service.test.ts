import test from 'node:test'
import assert from 'node:assert/strict'
import { ChatMessageRole } from '@prisma/client'

import {
  processCharacterActivityMessageLedgerRows,
  processPendingCharacterActivityBatchAsBackgroundWork,
  toUtcDayStart
} from './character-activity-count-service'

test('toUtcDayStart normalizes to the UTC day boundary', () => {
  assert.equal(toUtcDayStart(new Date('2026-05-11T23:59:59.999Z')).toISOString(), '2026-05-11T00:00:00.000Z')
})

test('processCharacterActivityMessageLedgerRows only counts claimed unprocessed rows once', async () => {
  const calls: unknown[] = []
  const processedRows = new Set<string>()
  const ledgerRows = [
    {
      id: 'ledger-user-1',
      messageId: 'message-user-1',
      sessionId: 'session-1',
      characterId: 'character-1',
      role: ChatMessageRole.USER,
      messageCreatedAt: new Date('2026-05-12T12:00:01.000Z'),
      processedAt: null
    },
    {
      id: 'ledger-assistant-1',
      messageId: 'message-assistant-1',
      sessionId: 'session-1',
      characterId: 'character-1',
      role: ChatMessageRole.ASSISTANT,
      messageCreatedAt: new Date('2026-05-12T12:00:02.000Z'),
      processedAt: null
    }
  ]

  const tx = {
    characterActivityMessageLedger: {
      findMany: async () => ledgerRows.filter((row) => !processedRows.has(row.id)),
      updateMany: async (input: { where: { id: string; processedAt: null } }) => {
        if (processedRows.has(input.where.id)) {
          return { count: 0 }
        }
        processedRows.add(input.where.id)
        return { count: 1 }
      }
    },
    chatMessage: {
      findFirst: async () => ({
        id: 'message-assistant-1'
      })
    },
    characterCompletedChatLedger: {
      create: async (input: unknown) => {
        calls.push(['characterCompletedChatLedger.create', input])
        return input
      }
    },
    character: {
      update: async (input: unknown) => {
        calls.push(['character.update', input])
        return input
      }
    },
    characterActivityDailyMetric: {
      upsert: async (input: unknown) => {
        calls.push(['characterActivityDailyMetric.upsert', input])
        return input
      }
    }
  }
  const db = {
    $transaction: async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx)
  }

  const firstResult = await processCharacterActivityMessageLedgerRows(db as never, {
    messageIds: ['message-user-1', 'message-assistant-1']
  })
  const secondResult = await processCharacterActivityMessageLedgerRows(db as never, {
    messageIds: ['message-user-1', 'message-assistant-1']
  })

  assert.deepEqual(firstResult, {
    processedMessageCount: 2,
    completedChatCounted: true
  })
  assert.deepEqual(secondResult, {
    processedMessageCount: 0,
    completedChatCounted: false
  })
  assert.deepEqual(calls, [
    [
      'characterCompletedChatLedger.create',
      {
        data: {
          sessionId: 'session-1',
          characterId: 'character-1',
          countedAt: new Date('2026-05-12T12:00:02.000Z')
        }
      }
    ],
    [
      'character.update',
      {
        where: {
          id: 'character-1'
        },
        data: {
          messageCount: {
            increment: 2
          },
          completedChatCount: {
            increment: 1
          }
        }
      }
    ],
    [
      'characterActivityDailyMetric.upsert',
      {
        where: {
          characterId_day: {
            characterId: 'character-1',
            day: new Date('2026-05-12T00:00:00.000Z')
          }
        },
        create: {
          characterId: 'character-1',
          day: new Date('2026-05-12T00:00:00.000Z'),
          messageCount: 2,
          completedChatCount: 1
        },
        update: {
          messageCount: {
            increment: 2
          },
          completedChatCount: {
            increment: 1
          }
        }
      }
    ]
  ])
})

test('processPendingCharacterActivityBatchAsBackgroundWork runs through the generic background monitor', async () => {
  let transactionCalled = false
  const observedOperations: string[] = []
  const db = {
    $transaction: async () => {
      transactionCalled = true
      return {
        processedMessageCount: 1,
        completedChatCounted: true
      }
    }
  }

  const result = await processPendingCharacterActivityBatchAsBackgroundWork({
    prismaClient: db as never,
    runObservedBackgroundWork: async (operationName, work) => {
      observedOperations.push(operationName)
      return work()
    }
  })

  assert.deepEqual(result, {
    processedMessageCount: 1,
    completedChatCounted: true
  })
  assert.deepEqual(observedOperations, ['character_activity_batch'])
  assert.equal(transactionCalled, true)
})
