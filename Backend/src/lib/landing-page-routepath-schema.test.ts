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

test('LandingPageVariant routePath is reusable but indexed for lookups', () => {
  const schema = readText(prismaSchemaPath)
  const variantModel = extractModelBlock(schema, 'LandingPageVariant')

  assert.doesNotMatch(variantModel, /\broutePath\s+String[^\n]*@unique\b/)
  assert.match(variantModel, /\broutePath\s+String\b/)
  assert.match(variantModel, /@@unique\(\[landingPageId,\s*key\]\)/)
  assert.match(variantModel, /@@index\(\[landingPageId,\s*isActive\]\)/)
  assert.match(variantModel, /@@index\(\[routePath\]\)/)
})

test('initial PostgreSQL migration creates only the reusable routePath lookup index', () => {
  const migrationSource = readText(initialPostgresMigrationPath)

  assert.match(
    migrationSource,
    /CREATE\s+INDEX\s+"LandingPageVariant_routePath_idx"\s+ON\s+"LandingPageVariant"\("routePath"\)/
  )
  assert.doesNotMatch(migrationSource, /LandingPageVariant_routePath_key/)
  assert.doesNotMatch(
    migrationSource,
    /CREATE\s+UNIQUE\s+INDEX[\s\S]{0,160}"LandingPageVariant_routePath_idx"/
  )
})
