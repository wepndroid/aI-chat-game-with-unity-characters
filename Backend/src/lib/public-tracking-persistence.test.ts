import assert from 'node:assert/strict'
import test from 'node:test'

import { runPublicTrackingPersistence } from './public-tracking-persistence'

test('runPublicTrackingPersistence returns the persisted tracking result', async () => {
  const result = await runPublicTrackingPersistence(
    async () => ({
      id: 'visit-1',
      tracked: true
    }),
    {
      operationName: 'landing.trackVisit',
      warn: () => {
        throw new Error('warning logger should not be called for successful persistence')
      }
    }
  )

  assert.deepEqual(result, {
    id: 'visit-1',
    tracked: true
  })
})

test('runPublicTrackingPersistence fails open with sanitized warning details', async () => {
  const warnings: Array<{ message: string; details: Record<string, string> }> = []
  const persistenceError = Object.assign(new Error('raw message with cookie=session-token'), {
    code: 'P2002'
  })

  const result = await runPublicTrackingPersistence(
    async () => {
      throw persistenceError
    },
    {
      operationName: 'landing.trackVisit',
      warn: (message, details) => warnings.push({ message, details })
    }
  )

  assert.deepEqual(result, { tracked: false })
  assert.deepEqual(warnings, [
    {
      message: '[landing] Public tracking persistence failed; returning fail-open response.',
      details: {
        operationName: 'landing.trackVisit',
        errorName: 'Error',
        errorCode: 'P2002'
      }
    }
  ])
  assert.equal(JSON.stringify(warnings).includes('session-token'), false)
})
