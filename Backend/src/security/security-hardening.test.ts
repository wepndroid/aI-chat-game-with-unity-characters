import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import request from 'supertest'
import { ZodError } from 'zod'
import { sendApiError } from '../lib/api-contract'
import { createCsrfOriginMiddleware } from '../middleware/csrf-origin-middleware'
import authRoutes, { setWebglLaunchResolveNoStoreCacheControl } from '../routes/auth-routes'

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
      isProduction: true,
      csrfExemptPaths: new Set(['/auth/unity-token'])
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
  app.post('/api/auth/unity-token', (_req, res) => {
    res.json({ ok: true })
  })

  return app
}

const createAuthRouteTestApp = () => {
  const app = express()
  app.use('/api', authRoutes)
  return app
}

const createWebglLaunchResolveNoStoreTestApp = () => {
  const app = express()
  app.use('/api', setWebglLaunchResolveNoStoreCacheControl)
  app.use(express.json())
  app.use('/api', authRoutes)
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      sendApiError(response, 400, 'VALIDATION_FAILED', error.issues[0]?.message ?? 'Validation failed.')
      return
    }

    sendApiError(response, 500, 'INTERNAL_ERROR', 'Internal server error.')
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

test('csrf middleware allows unity token route without origin header', async () => {
  const app = createTestApp()
  const response = await request(app).post('/api/auth/unity-token').send({})
  assert.equal(response.status, 200)
})

test('webgl token route is no-store even when auth is missing', async () => {
  const app = createAuthRouteTestApp()
  const response = await request(app).get('/api/auth/webgl-token')
  assert.equal(response.status, 401)
  assert.equal(response.headers['cache-control'], 'no-store')
})

test('webgl launch context issue route is no-store even when auth is missing', async () => {
  const app = createAuthRouteTestApp()
  const response = await request(app).post('/api/auth/webgl-launch-context').send({})
  assert.equal(response.status, 401)
  assert.equal(response.headers['cache-control'], 'no-store')
})

test('webgl launch context resolve route is no-store when body is missing', async () => {
  const app = createWebglLaunchResolveNoStoreTestApp()
  const response = await request(app)
    .post('/api/auth/webgl-launch-context/resolve')
    .send({})

  assert.equal(response.status, 400)
  assert.equal(response.headers['cache-control'], 'no-store')
})

test('webgl launch context resolve route is no-store when body is malformed', async () => {
  const app = createWebglLaunchResolveNoStoreTestApp()
  const response = await request(app)
    .post('/api/auth/webgl-launch-context/resolve')
    .set('Content-Type', 'application/json')
    .send('{')

  assert.equal(response.headers['cache-control'], 'no-store')
})
