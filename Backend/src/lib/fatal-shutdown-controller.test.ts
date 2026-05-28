import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getFatalShutdownState,
  registerFatalShutdownHttpServer,
  resetFatalShutdownForTests,
  scheduleFatalShutdown
} from './fatal-shutdown-controller'

type FakeTimer = {
  callback: () => void
  ms: number
}

const createRuntime = () => {
  const timers: FakeTimer[] = []
  const exitCodes: number[] = []
  const errors: unknown[][] = []

  return {
    timers,
    exitCodes,
    errors,
    runtime: {
      now: () => new Date('2026-05-18T08:31:05.000Z'),
      setTimeout: (callback: () => void, ms: number) => {
        timers.push({ callback, ms })
        return timers.length
      },
      exit: (code: number) => {
        exitCodes.push(code)
      },
      logger: {
        error: (...args: unknown[]) => {
          errors.push(args)
        }
      }
    }
  }
}

test('scheduleFatalShutdown records the first fatal state and schedules response and force timers', () => {
  const { runtime, timers } = createRuntime()
  resetFatalShutdownForTests({ runtime })

  const state = scheduleFatalShutdown({
    reason: 'prisma_engine_panic',
    source: 'request',
    diagnostic: {
      reason: 'prisma_engine_panic',
      errorName: 'PrismaClientRustPanicError',
      clientVersion: '6.19.0'
    }
  })

  assert.deepEqual(state, {
    reason: 'prisma_engine_panic',
    source: 'request',
    scheduledAt: '2026-05-18T08:31:05.000Z',
    exitCode: 1,
    responseGraceMs: 1000,
    forceExitMs: 10000,
    diagnostic: {
      reason: 'prisma_engine_panic',
      errorName: 'PrismaClientRustPanicError',
      clientVersion: '6.19.0'
    }
  })
  assert.equal(getFatalShutdownState(), state)
  assert.deepEqual(timers.map((timer) => timer.ms), [1000, 10000])
})

test('scheduleFatalShutdown is single shot and returns the original state', () => {
  const { runtime, timers, errors } = createRuntime()
  resetFatalShutdownForTests({ runtime })

  const first = scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'request' })
  const second = scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'handled_background' })

  assert.equal(second, first)
  assert.equal(timers.length, 2)
  assert.equal(errors.length, 1)
})

test('scheduleFatalShutdown closes the registered HTTP server once', () => {
  const { runtime } = createRuntime()
  let closeCount = 0
  const server = {
    close: (callback?: (error?: Error) => void) => {
      closeCount += 1
      callback?.()
      return server
    },
    closeIdleConnections: () => undefined
  }
  resetFatalShutdownForTests({ runtime })
  registerFatalShutdownHttpServer(server)

  scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'request' })
  scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'unhandled_rejection' })

  assert.equal(closeCount, 1)
})

test('scheduleFatalShutdown exits with code 1 after the response grace timer fires', () => {
  const { runtime, timers, exitCodes } = createRuntime()
  resetFatalShutdownForTests({ runtime })

  scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'request' })
  timers[0]?.callback()
  timers[1]?.callback()

  assert.deepEqual(exitCodes, [1])
})

test('scheduleFatalShutdown waits for force timer when the HTTP server does not drain', () => {
  const { runtime, timers, exitCodes } = createRuntime()
  resetFatalShutdownForTests({ runtime })
  registerFatalShutdownHttpServer({
    close: () => undefined
  })

  scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'request' })
  timers[0]?.callback()

  assert.deepEqual(exitCodes, [])

  timers[1]?.callback()

  assert.deepEqual(exitCodes, [1])
})
