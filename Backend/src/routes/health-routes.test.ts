import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'

import {
  resetFatalShutdownForTests,
  scheduleFatalShutdown
} from '../lib/fatal-shutdown-controller'
import { defaultRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import healthRoutes, { createHealthRoutes } from './health-routes'

type HealthRouteOptions = Parameters<typeof createHealthRoutes>[0]

const createApp = (options?: HealthRouteOptions) => {
  const app = express()
  app.use('/api', options ? createHealthRoutes(options) : healthRoutes)
  return app
}

test('health route reports ok when no fatal shutdown is scheduled', async () => {
  resetFatalShutdownForTests({
    runtime: {
      setTimeout: () => undefined,
      exit: () => undefined
    }
  })

  const response = await request(createApp()).get('/api/health')

  assert.equal(response.status, 200)
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.service, 'ai-chat-game-backend')
})

test('health route reports terminating while fatal shutdown is scheduled', async () => {
  resetFatalShutdownForTests({
    runtime: {
      now: () => new Date('2026-05-18T08:31:05.000Z'),
      setTimeout: () => undefined,
      exit: () => undefined,
      logger: {
        error: () => undefined
      }
    }
  })
  scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'unhandled_rejection' })

  const response = await request(createApp()).get('/api/health')

  assert.equal(response.status, 503)
  assert.equal(response.body.status, 'terminating')
  assert.equal(response.body.reason, 'prisma_engine_panic')
  assert.equal(response.body.service, 'ai-chat-game-backend')
})

test('maintenance health route reports runtime maintenance state when no fatal shutdown is scheduled', async () => {
  resetFatalShutdownForTests({
    runtime: {
      setTimeout: () => undefined,
      exit: () => undefined
    }
  })

  const response = await request(
    createApp({
      getRuntimeAdminSettings: async () => ({
        ...defaultRuntimeAdminSettings,
        maintenance: {
          ...defaultRuntimeAdminSettings.maintenance,
          enabled: true,
          message: 'Scheduled maintenance'
        }
      })
    })
  ).get('/api/health/maintenance')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    data: {
      active: true,
      message: 'Scheduled maintenance'
    }
  })
})

test('maintenance health route reports terminating without reading runtime settings during fatal shutdown', async () => {
  resetFatalShutdownForTests({
    runtime: {
      now: () => new Date('2026-05-18T08:31:05.000Z'),
      setTimeout: () => undefined,
      exit: () => undefined,
      logger: {
        error: () => undefined
      }
    }
  })
  scheduleFatalShutdown({ reason: 'prisma_engine_panic', source: 'unhandled_rejection' })
  let settingsReads = 0

  const response = await request(
    createApp({
      getRuntimeAdminSettings: async () => {
        settingsReads += 1
        throw new Error('Runtime settings should not be read while fatal shutdown is scheduled.')
      }
    })
  ).get('/api/health/maintenance')

  assert.equal(response.status, 503)
  assert.equal(response.body.status, 'terminating')
  assert.equal(response.body.reason, 'prisma_engine_panic')
  assert.equal(response.body.service, 'ai-chat-game-backend')
  assert.equal(settingsReads, 0)
})
