import test from 'node:test'
import assert from 'node:assert/strict'

import { prisma } from './prisma'
import {
  defaultRuntimeAdminSettings,
  toMaskedApiKeys,
  updateRuntimeAdminSettings
} from './runtime-admin-settings'

const withEnv = async (values: Record<string, string>, run: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }

  try {
    await run()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('updateRuntimeAdminSettings persists sanitized credential settings only', async () => {
  const runtimeAdminSettingsDelegate = prisma.runtimeAdminSettings as unknown as {
    upsert: (args: unknown) => Promise<unknown>
  }
  const originalUpsert = runtimeAdminSettingsDelegate.upsert
  let capturedUpsert: unknown = null

  runtimeAdminSettingsDelegate.upsert = async (args: unknown) => {
    capturedUpsert = args
    return {}
  }

  try {
    await withEnv({
      GOOGLE_OAUTH_CLIENT_SECRET: 'env-google-secret',
      PATREON_CLIENT_SECRET: 'env-patreon-secret',
      EMAIL_SMTP_PASS: 'env-smtp-secret',
      MAILGUN_API_KEY: 'env-mailgun-secret'
    }, async () => {
      const settings = await updateRuntimeAdminSettings({
        ...defaultRuntimeAdminSettings,
        apiKeys: {
          googleClientId: 'db-google-client',
          googleClientSecret: 'db-google-secret',
          googleRedirectUri: 'https://example.test/google',
          patreonClientId: 'db-patreon-client',
          patreonClientSecret: 'db-patreon-secret',
          patreonRedirectUri: 'https://example.test/patreon',
          emailProvider: 'mailgun',
          smtpHost: 'smtp.example.test',
          smtpPort: 2525,
          smtpUser: 'db-smtp-user',
          smtpPass: 'db-smtp-secret',
          smtpFrom: 'SecretWaifu <mail@example.test>',
          mailgunDomain: 'mg.example.test',
          mailgunApiKey: 'db-mailgun-secret',
          mailgunRegion: 'eu'
        }
      })

      assert.equal(settings.apiKeys.googleClientSecret, 'env-google-secret')
      assert.equal(settings.apiKeys.patreonClientSecret, 'env-patreon-secret')
      assert.equal(settings.apiKeys.smtpPass, 'env-smtp-secret')
      assert.equal(settings.apiKeys.mailgunApiKey, 'env-mailgun-secret')
    })
  } finally {
    runtimeAdminSettingsDelegate.upsert = originalUpsert
  }

  const serializedUpsert = JSON.stringify(capturedUpsert)
  assert.ok(serializedUpsert)
  assert.equal(serializedUpsert.includes('db-google-secret'), false)
  assert.equal(serializedUpsert.includes('db-patreon-secret'), false)
  assert.equal(serializedUpsert.includes('db-smtp-secret'), false)
  assert.equal(serializedUpsert.includes('db-mailgun-secret'), false)
})

test('toMaskedApiKeys hides secret credential material for admin responses', () => {
  const masked = toMaskedApiKeys({
    ...defaultRuntimeAdminSettings.apiKeys,
    googleClientSecret: 'google-secret-value',
    patreonClientSecret: 'patreon-secret-value',
    smtpPass: 'smtp-secret-value',
    mailgunApiKey: 'mailgun-secret-value'
  })

  assert.notEqual(masked.googleClientSecret, 'google-secret-value')
  assert.notEqual(masked.patreonClientSecret, 'patreon-secret-value')
  assert.notEqual(masked.smtpPass, 'smtp-secret-value')
  assert.notEqual(masked.mailgunApiKey, 'mailgun-secret-value')
  assert.equal(masked.googleClientSecret.endsWith('alue'), true)
  assert.equal(masked.patreonClientSecret.endsWith('alue'), true)
  assert.equal(masked.smtpPass.endsWith('alue'), true)
  assert.equal(masked.mailgunApiKey.endsWith('alue'), true)
})
