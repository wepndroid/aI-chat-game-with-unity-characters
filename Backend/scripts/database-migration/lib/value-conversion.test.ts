// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertKnownEnumValue,
  sqliteBigIntToBigInt,
  sqliteBooleanToBoolean,
  sqliteDateToUtcDate,
  sqliteJsonTextToPrismaJson
} from './value-conversion'

test('sqliteBooleanToBoolean accepts SQLite boolean storage shapes', () => {
  assert.equal(sqliteBooleanToBoolean(1, 'User.isBanned'), true)
  assert.equal(sqliteBooleanToBoolean(0, 'User.isBanned'), false)
  assert.equal(sqliteBooleanToBoolean(true, 'User.isBanned'), true)
  assert.equal(sqliteBooleanToBoolean(false, 'User.isBanned'), false)
  assert.throws(() => sqliteBooleanToBoolean(2, 'User.isBanned'), /Invalid boolean/)
})

test('sqliteDateToUtcDate converts SQLite text, seconds, and millisecond epochs', () => {
  assert.equal(sqliteDateToUtcDate('2026-05-19T12:34:56.789Z', 'createdAt')!.toISOString(), '2026-05-19T12:34:56.789Z')
  assert.equal(sqliteDateToUtcDate(1_768_988_096, 'createdAt')!.toISOString(), '2026-01-21T09:34:56.000Z')
  assert.equal(sqliteDateToUtcDate(1_768_988_096_123, 'createdAt')!.toISOString(), '2026-01-21T09:34:56.123Z')
  assert.equal(sqliteDateToUtcDate(null, 'optional', { nullable: true }), null)
  assert.throws(() => sqliteDateToUtcDate('not-a-date', 'createdAt'), /Invalid date/)
})

test('sqliteJsonTextToPrismaJson parses JSON and rejects malformed values', () => {
  assert.deepEqual(sqliteJsonTextToPrismaJson('{"enabled":true}', 'RuntimeAdminSettings.featureSwitches'), {
    enabled: true
  })
  assert.deepEqual(sqliteJsonTextToPrismaJson(null, 'PatreonSyncLog.details', { nullable: true }), null)
  assert.throws(() => sqliteJsonTextToPrismaJson('{', 'RuntimeAdminSettings.featureSwitches'), /Invalid JSON/)
})

test('sqliteBigIntToBigInt preserves large integer values', () => {
  assert.equal(sqliteBigIntToBigInt('9007199254740993', 'GameRelease.totalBytes'), 9007199254740993n)
  assert.equal(sqliteBigIntToBigInt(null, 'GameRelease.totalBytes', { nullable: true }), null)
  assert.throws(() => sqliteBigIntToBigInt('12.5', 'GameRelease.totalBytes'), /Invalid bigint/)
})

test('assertKnownEnumValue rejects values not present in the PostgreSQL enum', () => {
  assert.equal(assertKnownEnumValue('APPROVED', ['DRAFT', 'APPROVED'], 'Character.status'), 'APPROVED')
  assert.throws(() => assertKnownEnumValue('approved', ['DRAFT', 'APPROVED'], 'Character.status'), /Invalid enum/)
})
