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
const defaultHomepageServicePath = join(backendRoot, 'src', 'services', 'landing', 'default-homepage-service.ts')

const readText = (path: string) => readFileSync(path, 'utf8')

const extractModelBlock = (schema: string, modelName: string) => {
  const match = new RegExp(`model\\s+${modelName}\\s+\\{[\\s\\S]*?\\n\\}`).exec(schema)
  assert.ok(match, `Expected ${modelName} model to exist in Prisma schema.`)
  return match[0]
}

test('SiteHomepageSettings has a canonical Prisma schema contract', () => {
  const schema = readText(prismaSchemaPath)
  const landingPageModel = extractModelBlock(schema, 'LandingPage')
  const settingsModel = extractModelBlock(schema, 'SiteHomepageSettings')

  assert.match(landingPageModel, /\bhomepageSettings\s+SiteHomepageSettings\[\]/)
  assert.match(settingsModel, /\bid\s+String\s+@id\b/)
  assert.match(settingsModel, /\blandingPageId\s+String\?/)
  assert.match(settingsModel, /\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/)
  assert.match(settingsModel, /\bupdatedAt\s+DateTime\s+@updatedAt\b/)
  assert.match(
    settingsModel,
    /\blandingPage\s+LandingPage\?\s+@relation\(fields:\s*\[landingPageId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/
  )
})

test('initial PostgreSQL migration owns the default homepage settings table shape', () => {
  const migrationSource = readText(initialPostgresMigrationPath)

  assert.match(migrationSource, /CREATE\s+TABLE\s+"SiteHomepageSettings"/)
  assert.match(migrationSource, /"id"\s+TEXT\s+NOT\s+NULL/)
  assert.match(migrationSource, /"landingPageId"\s+TEXT/)
  assert.match(migrationSource, /"createdAt"\s+TIMESTAMPTZ\(3\)\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/)
  assert.match(migrationSource, /"updatedAt"\s+TIMESTAMPTZ\(3\)\s+NOT\s+NULL/)
  assert.match(migrationSource, /CONSTRAINT\s+"SiteHomepageSettings_pkey"\s+PRIMARY\s+KEY\s+\("id"\)/)
  assert.match(
    migrationSource,
    /ALTER\s+TABLE\s+"SiteHomepageSettings"\s+ADD\s+CONSTRAINT\s+"SiteHomepageSettings_landingPageId_fkey"\s+FOREIGN\s+KEY\s+\("landingPageId"\)\s+REFERENCES\s+"LandingPage"\s*\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/
  )
})

test('default homepage runtime service does not create schema', () => {
  const serviceSource = readText(defaultHomepageServicePath)

  assert.doesNotMatch(serviceSource, /CREATE\s+TABLE/i)
})
