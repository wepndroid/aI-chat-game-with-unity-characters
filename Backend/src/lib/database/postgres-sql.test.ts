import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  postgresEnumValue,
  postgresIdentifier,
  postgresJsonbValue,
  postgresTimestamptzValue
} from './postgres-sql'

const inspectSql = (fragment: { sql: string; values: unknown[] }) => fragment

test('postgresJsonbValue casts bound JSON text for PostgreSQL raw SQL', () => {
  const jsonText = JSON.stringify({ enabled: true })
  const fragment = inspectSql(postgresJsonbValue(jsonText))

  assert.equal(fragment.sql, '?::jsonb')
  assert.deepEqual(fragment.values, [jsonText])
})

test('postgresTimestamptzValue casts ISO timestamps for PostgreSQL raw SQL', () => {
  const timestamp = '2026-05-21T15:47:10.000Z'
  const fragment = inspectSql(postgresTimestamptzValue(timestamp))

  assert.equal(fragment.sql, '?::timestamptz')
  assert.deepEqual(fragment.values, [timestamp])
})

test('postgresEnumValue casts values through an allow-listed PostgreSQL enum type', () => {
  const fragment = inspectSql(postgresEnumValue('APPROVED', 'CharacterStatus'))

  assert.equal(fragment.sql, '?::"CharacterStatus"')
  assert.deepEqual(fragment.values, ['APPROVED'])
})

test('postgresEnumValue rejects enum type names outside the application schema allow-list', () => {
  assert.throws(
    () => postgresEnumValue('APPROVED', 'UnknownStatus'),
    /PostgreSQL enum type is not allow-listed/
  )
})

test('postgresIdentifier returns a quoted identifier only when it is explicitly allow-listed', () => {
  const fragment = inspectSql(postgresIdentifier('createdAt', ['createdAt', 'updatedAt']))

  assert.equal(fragment.sql, '"createdAt"')
  assert.deepEqual(fragment.values, [])
})

test('postgresIdentifier rejects unlisted and malformed identifiers', () => {
  assert.throws(() => postgresIdentifier('deletedAt', ['createdAt', 'updatedAt']), /PostgreSQL identifier is not allow-listed/)
  assert.throws(() => postgresIdentifier('createdAt; DROP TABLE "User"', ['createdAt; DROP TABLE "User"']), /PostgreSQL identifier is invalid/)
})
