import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'

import {
  buildChatPendingTurnGameplayPayloadSql,
  buildChatPendingTurnKindSql,
  buildChatPendingTurnStatusSql
} from './chat-pending-turn-service'

const inspectSql = (fragment: Prisma.Sql) => ({
  sql: fragment.sql,
  values: fragment.values
})

test('pending turn raw SQL casts PostgreSQL enum parameters', () => {
  const pendingStatus = inspectSql(buildChatPendingTurnStatusSql('PENDING'))
  const expiredStatus = inspectSql(buildChatPendingTurnStatusSql('EXPIRED'))
  const normalKind = inspectSql(buildChatPendingTurnKindSql('normal'))

  assert.equal(pendingStatus.sql, '?::"ChatPendingTurnStatus"')
  assert.deepEqual(pendingStatus.values, ['PENDING'])
  assert.equal(expiredStatus.sql, '?::"ChatPendingTurnStatus"')
  assert.deepEqual(expiredStatus.values, ['EXPIRED'])
  assert.equal(normalKind.sql, '?::"ChatPendingTurnKind"')
  assert.deepEqual(normalKind.values, ['normal'])
})

test('pending turn raw SQL casts gameplay payload JSON into jsonb', () => {
  const payloadJson = JSON.stringify({ event: 'undress' })
  const fragment = inspectSql(buildChatPendingTurnGameplayPayloadSql(payloadJson))

  assert.equal(fragment.sql, '?::jsonb')
  assert.deepEqual(fragment.values, [payloadJson])
})
