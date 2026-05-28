import test from 'node:test'
import assert from 'node:assert/strict'

import { runObservedBackgroundWork } from './background-work-monitor'

test('runObservedBackgroundWork logs slow completed background work without gating', async () => {
  const warnings: unknown[][] = []
  let nowMs = 1_000

  const result = await runObservedBackgroundWork(
    'marketing_email_automation_queue',
    async () => {
      nowMs = 1_900
      return 'completed'
    },
    {
      logger: {
        warn: (...args: unknown[]) => warnings.push(args)
      },
      nowMs: () => nowMs,
      slowOperationMs: 750
    }
  )

  assert.equal(result, 'completed')
  assert.deepEqual(warnings, [
    [
      '[background] Slow background work completed.',
      {
        operationName: 'marketing_email_automation_queue',
        elapsedMs: 900,
        outcome: 'completed'
      }
    ]
  ])
})

test('runObservedBackgroundWork logs failed background work with sanitized metadata only', async () => {
  const warnings: unknown[][] = []
  let nowMs = 5_000
  const error = Object.assign(new Error('SMTP failed for user@example.com with token secret-token'), {
    code: 'EAUTH'
  })

  await assert.rejects(
    () =>
      runObservedBackgroundWork(
        'marketing_email_automation_queue',
        async () => {
          nowMs = 5_100
          throw error
        },
        {
          logger: {
            warn: (...args: unknown[]) => warnings.push(args)
          },
          nowMs: () => nowMs,
          slowOperationMs: 750
        }
      ),
    error
  )

  assert.deepEqual(warnings, [
    [
      '[background] Background work failed.',
      {
        operationName: 'marketing_email_automation_queue',
        elapsedMs: 100,
        outcome: 'failed',
        error: {
          errorName: 'Error',
          errorCode: 'EAUTH'
        }
      }
    ]
  ])
  assert.equal(JSON.stringify(warnings).includes('user@example.com'), false)
  assert.equal(JSON.stringify(warnings).includes('secret-token'), false)
})
