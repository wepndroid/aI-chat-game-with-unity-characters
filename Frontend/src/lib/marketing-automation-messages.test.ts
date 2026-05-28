import assert from 'node:assert/strict'
import test from 'node:test'

import { formatAutomationStartSuccessMessage } from './marketing-automation-messages'

test('formatAutomationStartSuccessMessage tells admins that deferred automations will be queued by the worker', () => {
  assert.equal(
    formatAutomationStartSuccessMessage({
      eligible: 0,
      queued: 0,
      deferred: true
    }),
    'Automation started. Recipients will be queued by the background worker in bounded batches.'
  )
})

test('formatAutomationStartSuccessMessage keeps immediate queue counts when the backend returns them', () => {
  assert.equal(
    formatAutomationStartSuccessMessage({
      eligible: 12,
      queued: 10,
      deferred: false
    }),
    'Automation started. 10 of 12 eligible users were queued.'
  )
})
