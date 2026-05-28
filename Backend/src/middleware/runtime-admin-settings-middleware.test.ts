import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'

import { createRuntimeAdminSettingsMiddleware } from './runtime-admin-settings-middleware'

test('runtime admin settings middleware bypasses health routes before reading settings', async () => {
  let settingsReadCount = 0
  const app = express()

  app.use(createRuntimeAdminSettingsMiddleware({
    getRuntimeAdminSettings: async () => {
      settingsReadCount += 1
      throw new Error('health routes must not read runtime admin settings in global middleware')
    }
  }))
  app.get('/api/health/maintenance', (_request, response) => {
    response.json({
      ok: true
    })
  })

  const response = await request(app).get('/api/health/maintenance')

  assert.equal(response.status, 200)
  assert.equal(settingsReadCount, 0)
})
