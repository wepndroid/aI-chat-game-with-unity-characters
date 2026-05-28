// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSanitizedRuntimeApiKeys,
  planPendingTurnImport,
  shouldExcludeSourceTable
} from './import-policy'

const now = new Date('2026-05-19T12:00:00.000Z')

const basePendingTurn = {
  id: 'pending-1',
  reservationId: 'reservation-1',
  status: 'COMMITTED',
  expiresAt: '2026-05-19T11:50:00.000Z',
  updatedAt: '2026-05-19T11:55:00.000Z',
  committedAt: '2026-05-19T11:55:00.000Z',
  abortedAt: null,
  expiredAt: null
}

test('planPendingTurnImport keeps recent terminal pending-turn rows', () => {
  const decision = planPendingTurnImport(basePendingTurn, { now })

  assert.equal(decision.action, 'retain')
  assert.equal(decision.targetStatus, 'COMMITTED')
  assert.equal(decision.releaseReservation, false)
})

test('planPendingTurnImport skips terminal rows older than the retention window', () => {
  const decision = planPendingTurnImport(
    {
      ...basePendingTurn,
      updatedAt: '2026-05-18T10:00:00.000Z',
      committedAt: '2026-05-18T10:00:00.000Z'
    },
    { now }
  )

  assert.equal(decision.action, 'skip')
  assert.equal(decision.reason, 'terminal_retention_elapsed')
})

test('planPendingTurnImport converts expired pending rows and releases reservations', () => {
  const decision = planPendingTurnImport(
    {
      ...basePendingTurn,
      status: 'PENDING',
      expiresAt: '2026-05-19T11:59:00.000Z',
      updatedAt: '2026-05-19T11:50:00.000Z',
      committedAt: null
    },
    { now }
  )

  assert.equal(decision.action, 'retain')
  assert.equal(decision.targetStatus, 'EXPIRED')
  assert.equal(decision.releaseReservation, true)
})

test('planPendingTurnImport rejects active pending rows', () => {
  assert.throws(
    () =>
      planPendingTurnImport(
        {
          ...basePendingTurn,
          status: 'PENDING',
          expiresAt: '2026-05-19T12:01:00.000Z',
          committedAt: null
        },
        { now }
      ),
    /Active pending turn/
  )
})

test('shouldExcludeSourceTable documents reset and legacy policies', () => {
  assert.equal(shouldExcludeSourceTable('Session'), true)
  assert.equal(shouldExcludeSourceTable('UnityLaunchContext'), true)
  assert.equal(shouldExcludeSourceTable('FailedLoginAttempt'), true)
  assert.equal(shouldExcludeSourceTable('CharacterChatStartLedger'), true)
  assert.equal(shouldExcludeSourceTable('User'), false)
})

test('buildSanitizedRuntimeApiKeys keeps provider defaults without source secrets', () => {
  const source = {
    googleClientSecret: 'source-secret',
    smtpPass: 'source-password',
    emailProvider: 'smtp',
    smtpPort: 2525,
    mailgunRegion: 'eu'
  }

  assert.deepEqual(buildSanitizedRuntimeApiKeys(source), {
    googleClientId: '',
    googleClientSecret: '',
    googleRedirectUri: '',
    patreonClientId: '',
    patreonClientSecret: '',
    patreonRedirectUri: '',
    emailProvider: 'smtp',
    smtpHost: '',
    smtpPort: 2525,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    mailgunDomain: '',
    mailgunApiKey: '',
    mailgunRegion: 'eu'
  })
})
