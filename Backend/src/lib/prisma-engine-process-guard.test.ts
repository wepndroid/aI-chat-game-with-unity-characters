import assert from 'node:assert/strict'
import test from 'node:test'

import { handlePrismaEngineFatalProcessError } from './prisma-engine-process-guard'
import type { ScheduleFatalShutdownInput } from './fatal-shutdown-controller'

test('handlePrismaEngineFatalProcessError schedules shutdown for fatal unhandled rejections', () => {
  const scheduled: ScheduleFatalShutdownInput[] = []
  const error = Object.assign(new Error('engine crashed'), {
    name: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })

  const classification = handlePrismaEngineFatalProcessError(error, 'unhandled_rejection', {
    logger: {
      error: () => undefined
    },
    scheduleFatalShutdown: (input) => {
      scheduled.push(input)
    }
  })

  assert.deepEqual(classification, {
    reason: 'prisma_engine_panic',
    errorName: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })
  assert.deepEqual(scheduled, [
    {
      reason: 'prisma_engine_panic',
      source: 'unhandled_rejection',
      diagnostic: {
        reason: 'prisma_engine_panic',
        errorName: 'PrismaClientRustPanicError',
        clientVersion: '6.19.0'
      }
    }
  ])
})

test('handlePrismaEngineFatalProcessError ignores normal rejections', () => {
  let b_scheduled = false

  const classification = handlePrismaEngineFatalProcessError(new Error('ordinary rejection'), 'unhandled_rejection', {
    logger: {
      error: () => undefined
    },
    scheduleFatalShutdown: () => {
      b_scheduled = true
    }
  })

  assert.equal(classification, null)
  assert.equal(b_scheduled, false)
})
