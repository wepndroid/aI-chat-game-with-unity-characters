import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const backendRoot = join(__dirname, '..', '..')
const prismaSchemaPath = join(backendRoot, 'prisma', 'schema.prisma')
const initialPostgresMigrationPath = join(
  backendRoot,
  'prisma',
  'migrations',
  '20260519125850_initial_postgresql',
  'migration.sql'
)

const readText = (path: string) => readFileSync(path, 'utf8')

const extractModelBlock = (schema: string, modelName: string) => {
  const match = new RegExp(`model\\s+${modelName}\\s+\\{[\\s\\S]*?\\n\\}`).exec(schema)
  assert.ok(match, `Expected ${modelName} model to exist in Prisma schema.`)
  return match[0]
}

test('LandingPageTrackingIssue stores bounded aggregated public tracking mismatches', () => {
  const schema = readText(prismaSchemaPath)
  const issueModel = extractModelBlock(schema, 'LandingPageTrackingIssue')

  assert.match(issueModel, /\bfingerprint\s+String\s+@unique\b/)
  assert.match(issueModel, /\bkind\s+String\b/)
  assert.match(issueModel, /\blandingPageKey\s+String\?/)
  assert.match(issueModel, /\bvariantKey\s+String\?/)
  assert.match(issueModel, /\broutePath\s+String\?/)
  assert.match(issueModel, /\bshortUrlKey\s+String\?/)
  assert.match(issueModel, /\bseenCount\s+Int\s+@default\(1\)/)
  assert.match(issueModel, /@@index\(\[lastSeenAt\]\)/)
  assert.match(issueModel, /@@index\(\[kind,\s*lastSeenAt\]\)/)
  assert.match(issueModel, /@@index\(\[landingPageKey,\s*lastSeenAt\]\)/)
})

test('initial PostgreSQL migration creates the tracking issue table and lookup indexes', () => {
  const migrationSource = readText(initialPostgresMigrationPath)

  assert.match(migrationSource, /CREATE\s+TABLE\s+"LandingPageTrackingIssue"/)
  assert.match(migrationSource, /CREATE\s+UNIQUE\s+INDEX\s+"LandingPageTrackingIssue_fingerprint_key"/)
  assert.match(migrationSource, /CREATE\s+INDEX\s+"LandingPageTrackingIssue_lastSeenAt_idx"/)
  assert.match(migrationSource, /CREATE\s+INDEX\s+"LandingPageTrackingIssue_kind_lastSeenAt_idx"/)
  assert.match(migrationSource, /CREATE\s+INDEX\s+"LandingPageTrackingIssue_landingPageKey_lastSeenAt_idx"/)
})
