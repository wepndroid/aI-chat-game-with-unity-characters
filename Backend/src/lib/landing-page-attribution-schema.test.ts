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

test('LandingPageVisit stores GA browser attribution identifiers', () => {
  const schema = readText(prismaSchemaPath)
  const visitModel = extractModelBlock(schema, 'LandingPageVisit')

  assert.match(visitModel, /\bgaClientId\s+String\?/)
  assert.match(visitModel, /\bgaSessionId\s+String\?/)
})

test('initial PostgreSQL migration owns GA identifier columns', () => {
  const migrationSource = readText(initialPostgresMigrationPath)

  assert.match(migrationSource, /CREATE\s+TABLE\s+"LandingPageVisit"[\s\S]*"gaClientId"\s+TEXT/)
  assert.match(migrationSource, /CREATE\s+TABLE\s+"LandingPageVisit"[\s\S]*"gaSessionId"\s+TEXT/)
})
