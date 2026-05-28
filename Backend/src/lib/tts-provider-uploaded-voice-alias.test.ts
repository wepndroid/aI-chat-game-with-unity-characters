import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createProviderUploadedVoiceWorkerBackoffState,
  handleProviderUploadedVoiceRegistrationFailure
} from './tts-provider-uploaded-voice-alias'

test('createProviderUploadedVoiceWorkerBackoffState skips ticks until the pressure backoff expires', () => {
  let nowMs = 10_000
  const state = createProviderUploadedVoiceWorkerBackoffState({
    calculateBackoffMs: (attempt) => 1000 * (attempt + 1),
    nowMs: () => nowMs
  })

  assert.equal(state.shouldSkipTick(), false)

  state.recordDatabasePressure()

  assert.equal(state.shouldSkipTick(), true)
  nowMs = 11_000
  assert.equal(state.shouldSkipTick(), false)

  state.recordDatabasePressure()
  nowMs = 12_999
  assert.equal(state.shouldSkipTick(), true)
  nowMs = 13_000
  assert.equal(state.shouldSkipTick(), false)
})

test('createProviderUploadedVoiceWorkerBackoffState resets pressure attempts after a clean tick', () => {
  let nowMs = 10_000
  const state = createProviderUploadedVoiceWorkerBackoffState({
    calculateBackoffMs: (attempt) => 1000 * (attempt + 1),
    nowMs: () => nowMs
  })

  state.recordDatabasePressure()
  nowMs = 11_000
  state.recordCleanTick()
  state.recordDatabasePressure()

  assert.equal(state.getBackoffUntilMs(), 12_000)
})

test('handleProviderUploadedVoiceRegistrationFailure skips failure persistence after fatal engine panic', async () => {
  const databaseOperations: string[] = []
  const warnings: unknown[][] = []
  const error = Object.assign(new Error('engine crashed'), {
    name: 'PrismaClientRustPanicError',
    clientVersion: '6.19.0'
  })

  const result = await handleProviderUploadedVoiceRegistrationFailure({
    row: {
      id: 'registration-1',
      uploadedRelativePath: 'voices/user.wav',
      fileSignature: '123:456',
      providerAlias: 'secretwaifu_upload_voice',
      providerVoiceRefPath: 'secretwaifu_upload_voice',
      status: 'refreshing',
      attemptCount: 1,
      lastAttemptAt: null,
      nextRetryAt: null,
      lastError: null,
      leaseOwner: 'worker-1',
      leaseExpiresAt: null,
      createdAt: new Date('2026-05-18T08:31:05.000Z'),
      updatedAt: new Date('2026-05-18T08:31:05.000Z')
    },
    error,
    databaseWork: async (operationName) => {
      databaseOperations.push(operationName)
      throw new Error('mark_failed should not run after fatal engine panic')
    },
    fatalReporter: () => ({
      reason: 'prisma_engine_panic',
      errorName: 'PrismaClientRustPanicError',
      clientVersion: '6.19.0'
    }),
    logger: {
      warn: (...args: unknown[]) => {
        warnings.push(args)
      }
    }
  })

  assert.equal(result, 'fatal_prisma_engine_panic')
  assert.deepEqual(databaseOperations, [])
  assert.deepEqual(warnings, [])
})
