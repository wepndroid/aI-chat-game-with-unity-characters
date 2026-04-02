import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import request from 'supertest'
import { createCsrfOriginMiddleware } from '../middleware/csrf-origin-middleware'

const createTestApp = () => {
  const app = express()
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  )
  app.use(express.json())
  app.use(
    '/api',
    createCsrfOriginMiddleware({
      allowedOrigins: new Set(['http://127.0.0.1:7000', 'http://localhost:7000']),
      isProduction: true
    })
  )
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 60_000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false
    })
  )

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })
  app.post('/api/protected', (_req, res) => {
    res.json({ ok: true })
  })
  app.post('/api/auth/login', (_req, res) => {
    res.json({ ok: true })
  })

  return app
}

test('helmet applies baseline security headers', async () => {
  const app = createTestApp()
  const response = await request(app).get('/api/health')
  assert.equal(response.status, 200)
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  assert.ok(response.headers['x-frame-options'])
})

test('csrf middleware blocks state-changing request from untrusted origin', async () => {
  const app = createTestApp()
  const response = await request(app).post('/api/protected').set('Origin', 'https://evil.example').send({})
  assert.equal(response.status, 403)
})

test('csrf middleware allows trusted origin for state-changing request', async () => {
  const app = createTestApp()
  const response = await request(app).post('/api/protected').set('Origin', 'http://127.0.0.1:7000').send({})
  assert.equal(response.status, 200)
})

test('auth limiter returns 429 after threshold', async () => {
  const app = createTestApp()
  await request(app).post('/api/auth/login').set('Origin', 'http://127.0.0.1:7000').send({})
  await request(app).post('/api/auth/login').set('Origin', 'http://127.0.0.1:7000').send({})
  const response = await request(app).post('/api/auth/login').set('Origin', 'http://127.0.0.1:7000').send({})
  assert.equal(response.status, 429)
})
