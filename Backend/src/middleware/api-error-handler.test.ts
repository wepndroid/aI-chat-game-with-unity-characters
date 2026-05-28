import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { z } from 'zod'

import { createApiErrorHandler } from './api-error-handler'
import type { ScheduleFatalShutdownInput } from '../lib/fatal-shutdown-controller'

const createQuietLogger = () => ({
  error: () => undefined
})

test('api error handler returns 503 and schedules shutdown for Prisma engine panics', async () => {
  const scheduled: ScheduleFatalShutdownInput[] = []
  const app = express()

  app.get('/fatal', () => {
    throw Object.assign(new Error('engine crashed'), {
      name: 'PrismaClientRustPanicError',
      clientVersion: '6.19.0'
    })
  })
  app.use(
    createApiErrorHandler({
      logger: createQuietLogger(),
      scheduleFatalShutdown: (input) => {
        scheduled.push(input)
        return {
          reason: input.reason,
          source: input.source,
          scheduledAt: '2026-05-18T08:31:05.000Z',
          exitCode: 1,
          responseGraceMs: 1000,
          forceExitMs: 10000,
          ...(input.diagnostic ? { diagnostic: input.diagnostic } : {})
        }
      }
    })
  )

  const response = await request(app).get('/fatal')

  assert.equal(response.status, 503)
  assert.deepEqual(response.body, {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database engine crashed. Service is restarting.'
    },
    code: 'SERVICE_UNAVAILABLE',
    message: 'Database engine crashed. Service is restarting.'
  })
  assert.deepEqual(scheduled, [
    {
      reason: 'prisma_engine_panic',
      source: 'request',
      diagnostic: {
        reason: 'prisma_engine_panic',
        errorName: 'PrismaClientRustPanicError',
        clientVersion: '6.19.0'
      }
    }
  ])
})

test('api error handler preserves Zod validation responses', async () => {
  const app = express()
  let b_scheduled = false

  app.get('/validation', () => {
    z.object({ name: z.string() }).parse({})
  })
  app.use(
    createApiErrorHandler({
      logger: createQuietLogger(),
      scheduleFatalShutdown: (input) => {
        b_scheduled = true
        throw new Error(`unexpected schedule: ${input.reason}`)
      }
    })
  )

  const response = await request(app).get('/validation')

  assert.equal(response.status, 400)
  assert.equal(response.body.code, 'VALIDATION_FAILED')
  assert.equal(response.body.error.code, 'VALIDATION_FAILED')
  assert.equal(b_scheduled, false)
})

test('api error handler preserves generic internal error responses', async () => {
  const app = express()
  let b_scheduled = false

  app.get('/generic', () => {
    throw new Error('ordinary failure')
  })
  app.use(
    createApiErrorHandler({
      logger: createQuietLogger(),
      scheduleFatalShutdown: (input) => {
        b_scheduled = true
        throw new Error(`unexpected schedule: ${input.reason}`)
      }
    })
  )

  const response = await request(app).get('/generic')

  assert.equal(response.status, 500)
  assert.deepEqual(response.body, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.'
    },
    code: 'INTERNAL_ERROR',
    message: 'Internal server error.'
  })
  assert.equal(b_scheduled, false)
})

test('api error handler delegates after response headers are sent', () => {
  const error = new Error('late failure')
  const delegated: unknown[] = []
  const handler = createApiErrorHandler({
    logger: createQuietLogger(),
    scheduleFatalShutdown: (input) => {
      throw new Error(`unexpected schedule: ${input.reason}`)
    }
  })

  handler(
    error,
    {} as express.Request,
    { headersSent: true } as express.Response,
    (delegatedError?: unknown) => {
      delegated.push(delegatedError)
    }
  )

  assert.deepEqual(delegated, [error])
})
