import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'

import { buildUnitySessionMetadataJsonSql } from './unity-session-state-service'

const inspectSql = (fragment: Prisma.Sql) => ({
  sql: fragment.sql,
  values: fragment.values
})

test('Unity session metadata raw SQL casts JSON text into jsonb', () => {
  const metadataJson = JSON.stringify({ mood: 'calm' })
  const fragment = inspectSql(buildUnitySessionMetadataJsonSql(metadataJson))

  assert.equal(fragment.sql, '?::jsonb')
  assert.deepEqual(fragment.values, [metadataJson])
})
