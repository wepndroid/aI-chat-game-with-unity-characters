// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readTargetRowsForModel } from './postgres-target'
import {
  compareTableFingerprint,
  formatFingerprintMismatch,
  validateImportRowFingerprints
} from './import-integrity-validator'

const userEntry = {
  sourceTable: 'User',
  targetModel: 'User',
  delegateName: 'user',
  mode: 'import' as const
}

test('readTargetRowsForModel reads PostgreSQL scalar fields through delegate findMany select', async () => {
  const calls: unknown[] = []
  const prisma = {
    user: {
      findMany: async (args: unknown) => {
        calls.push(args)
        return [{ id: 'user-1', email: 'user@example.com' }]
      }
    }
  }

  const rows = await readTargetRowsForModel(prisma as never, 'user', 'User')

  assert.deepEqual(rows, [{ id: 'user-1', email: 'user@example.com' }])
  assert.equal(calls.length, 1)
  assert.equal((calls[0] as { select: Record<string, boolean> }).select.id, true)
  assert.equal((calls[0] as { select: Record<string, boolean> }).select.email, true)
  assert.equal(Object.hasOwn((calls[0] as { select: Record<string, boolean> }).select, 'sessions'), false)
})

test('compareTableFingerprint passes identical expected and actual rows', () => {
  const validation = compareTableFingerprint(userEntry, [{ id: 'user-1', email: 'user@example.com' }], [
    { email: 'user@example.com', id: 'user-1' }
  ])

  assert.equal(validation.matches, true)
  assert.equal(formatFingerprintMismatch(validation), null)
})

test('compareTableFingerprint reports same-count value drift as fingerprint mismatch', () => {
  const validation = compareTableFingerprint(userEntry, [{ id: 'user-1', email: 'source@example.com' }], [
    { id: 'user-1', email: 'target@example.com' }
  ])

  assert.equal(validation.matches, false)
  assert.equal(formatFingerprintMismatch(validation), 'User: fingerprint mismatch with 1 expected rows and 1 actual rows')
})

test('compareTableFingerprint reports count mismatch concisely', () => {
  const validation = compareTableFingerprint(userEntry, [{ id: 'user-1', email: 'source@example.com' }], [])

  assert.equal(validation.matches, false)
  assert.equal(formatFingerprintMismatch(validation), 'User: expected 1 rows, got 0')
})

test('validateImportRowFingerprints keeps transient table counts outside fingerprint results', async () => {
  const prisma = {
    user: {
      findMany: async () => [{ id: 'user-1', email: 'user@example.com' }]
    }
  }

  const result = await validateImportRowFingerprints(
    prisma as never,
    { User: [{ id: 'user-1', email: 'user@example.com' }] },
    [userEntry]
  )

  assert.equal(result.fingerprintValidations.length, 1)
  assert.deepEqual(result.mismatches, [])
  assert.equal(Object.hasOwn(result, 'transientTargetCounts'), false)
})
