import test from 'node:test'
import assert from 'node:assert/strict'
import { redactLogText } from './log-redaction'

test('redacts obvious bearer tokens and secret key values', () => {
  const text =
    'Authorization: Bearer eyJhbGciOi.secret.token API_KEY=sk-live-secret password="hunter2" cookie=sessionid=abc123'
  const redacted = redactLogText(text)

  assert.equal(redacted.includes('eyJhbGciOi.secret.token'), false)
  assert.equal(redacted.includes('sk-live-secret'), false)
  assert.equal(redacted.includes('hunter2'), false)
  assert.equal(redacted.includes('sessionid=abc123'), false)
  assert.match(redacted, /Authorization: \[REDACTED\]/)
})

test('redacts provider and OAuth secret fields without removing normal stack trace text', () => {
  const text = [
    'Error: provider failed',
    '    at requestProvider (src/services/tts/provider-tts-websocket-adapter.ts:42:7)',
    'GOOGLE_OAUTH_CLIENT_SECRET=google-secret',
    'PATREON_WEBHOOK_SHARED_SECRET=patreon-secret',
    'EMAIL_SMTP_PASS=smtp-secret',
    '{"refresh_token":"refresh-secret","ordinary":"keep-me"}',
    'Set-Cookie: secretwaifu_auth=session-secret; HttpOnly'
  ].join('\n')

  const redacted = redactLogText(text)

  assert.equal(redacted.includes('google-secret'), false)
  assert.equal(redacted.includes('patreon-secret'), false)
  assert.equal(redacted.includes('smtp-secret'), false)
  assert.equal(redacted.includes('refresh-secret'), false)
  assert.equal(redacted.includes('session-secret'), false)
  assert.equal(redacted.includes('ordinary":"keep-me'), true)
  assert.equal(redacted.includes('provider-tts-websocket-adapter.ts:42:7'), true)
})

test('redacts stream tokens, multiline object dumps, and quoted env-style secrets', () => {
  const text = [
    'GET /api/tts/stream/task-id?stream_token=voice-stream-secret&other=keep',
    "{ headers: { Authorization: 'Bearer provider-secret-token-value' } }",
    'CHAT_TTS_API_BEARER_TOKEN="provider-token-with-$pecial|chars"',
    "PATREON_CLIENT_SECRET='patreon secret with spaces'",
    '{"id_token":"oauth-id-token","public":"keep"}'
  ].join('\n')

  const redacted = redactLogText(text)

  assert.equal(redacted.includes('voice-stream-secret'), false)
  assert.equal(redacted.includes('provider-secret-token-value'), false)
  assert.equal(redacted.includes('provider-token-with-$pecial|chars'), false)
  assert.equal(redacted.includes('patreon secret with spaces'), false)
  assert.equal(redacted.includes('oauth-id-token'), false)
  assert.equal(redacted.includes('other=keep'), true)
  assert.equal(redacted.includes('"public":"keep"'), true)
})

test('redacts WebGL launch tokens from logs', () => {
  const text = 'POST /api/auth/webgl-launch-context/resolve launch_token=raw-launch-token-value'
  const redacted = redactLogText(text)

  assert.equal(redacted.includes('raw-launch-token-value'), false)
  assert.match(redacted, /launch_token=\[REDACTED\]/)
})
