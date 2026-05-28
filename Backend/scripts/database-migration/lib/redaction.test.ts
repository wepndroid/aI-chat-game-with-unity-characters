// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { redactMigrationValue, redactText } from './redaction'

test('preserves existing text redaction behavior for bearer tokens and secrets', () => {
  const redacted = redactText('Authorization: Bearer live-token-value API_KEY=sk-live password="hunter2"')

  assert.equal(redacted.includes('live-token-value'), false)
  assert.equal(redacted.includes('sk-live'), false)
  assert.equal(redacted.includes('hunter2'), false)
  assert.match(redacted, /Authorization: \[REDACTED\]/)
})

test('redacts secret-like object keys recursively while preserving operational counts', () => {
  const redacted = redactMigrationValue({
    databaseUrl: 'postgresql://postgres:secret@localhost:5433/db',
    nested: {
      apiKey: 'secret-key',
      rowCount: 47,
      tableName: 'ChatMessage'
    },
    rowCounts: {
      EmailVerificationToken: 12,
      PasswordResetToken: 3
    },
    values: [{ refreshToken: 'refresh-secret' }, 'ordinary text']
  })

  assert.deepEqual(redacted, {
    databaseUrl: '[REDACTED]',
    nested: {
      apiKey: '[REDACTED]',
      rowCount: 47,
      tableName: 'ChatMessage'
    },
    rowCounts: {
      EmailVerificationToken: 12,
      PasswordResetToken: 3
    },
    values: [{ refreshToken: '[REDACTED]' }, 'ordinary text']
  })
})

test('redacts token-looking content inside strings without redacting normal text', () => {
  const redacted = redactMigrationValue({
    message: 'stream_token=raw-stream-token and ordinary=keep'
  })

  assert.deepEqual(redacted, {
    message: 'stream_token=[REDACTED] and ordinary=keep'
  })
})
