// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTableFingerprint, canonicalizeRow } from './row-fingerprint'

test('canonical rows sort object keys and normalize scalar value types deterministically', () => {
  const row = canonicalizeRow({
    nested: { z: 'last', a: 1 },
    createdAt: new Date('2026-05-21T10:20:30.456Z'),
    sequence: 9007199254740993n,
    enabled: true,
    missing: null,
    tags: ['b', 'a']
  })

  assert.deepEqual(Object.keys(row), ['createdAt', 'enabled', 'missing', 'nested', 'sequence', 'tags'])
  assert.deepEqual(row.createdAt, { type: 'date', value: '2026-05-21T10:20:30.456Z' })
  assert.deepEqual(row.sequence, { type: 'bigint', value: '9007199254740993' })
  assert.deepEqual(row.nested, {
    type: 'object',
    value: {
      a: { type: 'number', value: 1 },
      z: { type: 'string', value: 'last' }
    }
  })
  assert.deepEqual(row.tags, {
    type: 'array',
    value: [
      { type: 'string', value: 'b' },
      { type: 'string', value: 'a' }
    ]
  })
})

test('table fingerprints are stable for object key order and row order', () => {
  const first = buildTableFingerprint('RuntimeAdminSettings', [
    { id: 'settings', apiKeys: { smtpPort: 2525, emailProvider: 'smtp' } },
    { id: 'other', apiKeys: { emailProvider: 'mailgun', smtpPort: 587 } }
  ])
  const second = buildTableFingerprint('RuntimeAdminSettings', [
    { apiKeys: { smtpPort: 587, emailProvider: 'mailgun' }, id: 'other' },
    { apiKeys: { emailProvider: 'smtp', smtpPort: 2525 }, id: 'settings' }
  ])

  assert.equal(first.fingerprint, second.fingerprint)
  assert.equal(first.rowCount, 2)
})

test('table fingerprints change when count or ordered array values change', () => {
  const base = buildTableFingerprint('ExampleModel', [{ id: 'row-1', values: ['a', 'b'] }])
  const duplicate = buildTableFingerprint('ExampleModel', [
    { id: 'row-1', values: ['a', 'b'] },
    { id: 'row-1', values: ['a', 'b'] }
  ])
  const reorderedArray = buildTableFingerprint('ExampleModel', [{ id: 'row-1', values: ['b', 'a'] }])

  assert.notEqual(base.fingerprint, duplicate.fingerprint)
  assert.notEqual(base.fingerprint, reorderedArray.fingerprint)
})

test('table fingerprint summaries expose only aggregate counts and hashes', () => {
  const summary = buildTableFingerprint('User', [{ id: 'user-1', email: 'private@example.com' }])
  const serialized = JSON.stringify(summary)

  assert.deepEqual(Object.keys(summary), ['fingerprint', 'rowCount', 'targetModel'])
  assert.equal(serialized.includes('private@example.com'), false)
  assert.equal(serialized.includes('user-1'), false)
  assert.equal(Object.hasOwn(summary, 'rowHashes'), false)
  assert.equal(Object.hasOwn(summary, 'rows'), false)
})

test('canonicalization rejects undefined values before they can hide in a hash', () => {
  assert.throws(() => canonicalizeRow({ id: undefined }), /undefined.*id/)
})
