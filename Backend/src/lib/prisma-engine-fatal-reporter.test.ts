import assert from 'node:assert/strict'
import test from 'node:test'

import { reportPrismaEngineFatalError } from './prisma-engine-fatal-reporter'
import type { ScheduleFatalShutdownInput } from './fatal-shutdown-controller'

test('reportPrismaEngineFatalError schedules shutdown and logs sanitized context for handled background panics', () => {
  const scheduled: ScheduleFatalShutdownInput[] = []
  const errors: unknown[][] = []
  const error = Object.assign(new Error('engine crashed'), {
    name: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })

  const classification = reportPrismaEngineFatalError({
    error,
    source: 'handled_background',
    logContext: {
      component: 'chat-session-preview-refresh',
      pendingTurnId: 'turn-1'
    },
    logger: {
      error: (...args: unknown[]) => {
        errors.push(args)
      }
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
      source: 'handled_background',
      diagnostic: {
        reason: 'prisma_engine_panic',
        errorName: 'PrismaClientRustPanicError',
        clientVersion: '6.19.0'
      }
    }
  ])
  assert.equal(errors.length, 1)
  assert.equal(errors[0]?.[0], '[prisma-engine-fatal] Fatal Prisma Query Engine error reported.')
  assert.deepEqual(errors[0]?.[1], {
    source: 'handled_background',
    reason: 'prisma_engine_panic',
    errorName: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0',
    context: {
      component: 'chat-session-preview-refresh',
      pendingTurnId: 'turn-1'
    }
  })
})

test('reportPrismaEngineFatalError ignores ordinary errors', () => {
  let b_scheduled = false
  let b_logged = false

  const classification = reportPrismaEngineFatalError({
    error: new Error('temporary provider error'),
    source: 'handled_background',
    logger: {
      error: () => {
        b_logged = true
      }
    },
    scheduleFatalShutdown: () => {
      b_scheduled = true
    }
  })

  assert.equal(classification, null)
  assert.equal(b_scheduled, false)
  assert.equal(b_logged, false)
})
