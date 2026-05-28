import assert from 'node:assert/strict'
import test from 'node:test'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { prisma } from '../lib/prisma'
import landingPageRoutes from './landing-page-routes'

test('track signup click fails open when attribution persistence fails', async (t) => {
  const originalFindFirst = prisma.landingPageVisit.findFirst
  const originalWarn = console.warn
  const warnings: Array<unknown[]> = []

  const failingFindFirst: typeof originalFindFirst = () => {
    throw Object.assign(new Error('database unavailable'), {
      code: 'P2028'
    })
  }

  prisma.landingPageVisit.findFirst = failingFindFirst
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }

  t.after(() => {
    prisma.landingPageVisit.findFirst = originalFindFirst
    console.warn = originalWarn
  })

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api', landingPageRoutes)
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({
      error: 'unhandled'
    })
  })

  const response = await request(app)
    .post('/api/landing-pages/track-signup-click')
    .set('Cookie', 'sw_lp_vid=visitor-1')
    .send({})

  assert.equal(response.status, 201)
  assert.deepEqual(response.body, {
    data: {
      tracked: false
    }
  })
  assert.deepEqual(warnings, [
    [
      '[landing] Public tracking persistence failed; returning fail-open response.',
      {
        operationName: 'landing.trackSignupClick',
        errorName: 'Error',
        errorCode: 'P2028'
      }
    ]
  ])
})

test('track visit returns tracked false for unknown landing pages without creating catalog rows', async (t) => {
  const originalFindUnique = prisma.landingPage.findUnique
  const originalLandingPageUpsert = prisma.landingPage.upsert
  const originalVisitUpsert = prisma.landingPageVisit.upsert
  const originalIssueUpsert = prisma.landingPageTrackingIssue.upsert
  const issueUpserts: unknown[] = []

  prisma.landingPage.findUnique = (async () => null) as unknown as typeof originalFindUnique
  prisma.landingPage.upsert = (async () => {
    throw new Error('public tracking must not create or update landing pages')
  }) as unknown as typeof originalLandingPageUpsert
  prisma.landingPageVisit.upsert = (async () => {
    throw new Error('unknown landing pages must not create visits')
  }) as unknown as typeof originalVisitUpsert
  prisma.landingPageTrackingIssue.upsert = (async (query: unknown) => {
    issueUpserts.push(query)
    return {
      id: 'issue-1'
    }
  }) as typeof originalIssueUpsert

  t.after(() => {
    prisma.landingPage.findUnique = originalFindUnique
    prisma.landingPage.upsert = originalLandingPageUpsert
    prisma.landingPageVisit.upsert = originalVisitUpsert
    prisma.landingPageTrackingIssue.upsert = originalIssueUpsert
  })

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api', landingPageRoutes)
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({
      error: 'unhandled'
    })
  })

  const response = await request(app)
    .post('/api/landing-pages/track-visit')
    .set('Cookie', 'sw_lp_vid=visitor-1')
    .send({
      landingPageKey: 'Missing Landing',
      variantKey: 'Default',
      shortUrlKey: 'Paid Link',
      routePath: '/?token=secret'
    })

  assert.equal(response.status, 201)
  assert.deepEqual(response.body, {
    data: {
      tracked: false
    }
  })
  assert.equal(issueUpserts.length, 1)
  assert.equal(JSON.stringify(issueUpserts).includes('secret'), false)
  assert.equal(JSON.stringify(issueUpserts).includes('missing-landing'), true)
})
