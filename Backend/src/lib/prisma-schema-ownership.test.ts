import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'

const backendRoot = join(__dirname, '..', '..')
const prismaRoot = join(backendRoot, 'prisma')
const schemaPath = join(backendRoot, 'prisma', 'schema.prisma')
const sourceRoot = join(backendRoot, 'src')

type RequiredModel = {
  modelName: string
  mappedTableName?: string
}

const requiredSchemaOwnedModels: readonly RequiredModel[] = [
  { modelName: 'RuntimeAdminSettings' },
  { modelName: 'ChatSessionPreviewRefreshJob' },
  { modelName: 'ChatPendingTurn' },
  { modelName: 'UnitySessionState' },
  { modelName: 'GameRelease' },
  { modelName: 'NewsArticle' },
  { modelName: 'StaticPage', mappedTableName: 'StaticPages' },
  { modelName: 'PatreonSyncLog' },
  { modelName: 'MarketingEmailTemplate', mappedTableName: 'MarketingEmailTemplates' },
  { modelName: 'MarketingEmailSendLog' },
  { modelName: 'MarketingEmailAutomation' },
  { modelName: 'MarketingEmailAutomationRecipient' },
  { modelName: 'UserActivityState' }
] as const

const collectRuntimeSourceFiles = (directory: string): string[] => {
  const files: string[] = []

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      files.push(...collectRuntimeSourceFiles(path))
      continue
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      files.push(path)
    }
  }

  return files
}

const extractModelBlocks = (schema: string) => {
  const blocks = new Map<string, string>()
  const modelPattern = /^model\s+(\w+)\s+\{([\s\S]*?)^}/gm

  for (const match of schema.matchAll(modelPattern)) {
    blocks.set(match[1], match[0])
  }

  return blocks
}

const getDatasourceProvider = (schema: string) => {
  const providerMatch = schema.match(/datasource\s+db\s+\{[\s\S]*?provider\s*=\s*"([^"]+)"/)
  return providerMatch?.[1] ?? null
}

const extractRuntimeCreatedTables = () => {
  const tables = new Map<string, Set<string>>()
  const tableConstantPattern = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g
  const createTablePattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Z][A-Z0-9_]*)\})/gi

  for (const file of collectRuntimeSourceFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8')
    const relativeFile = relative(sourceRoot, file).replace(/\\/g, '/')
    const tableConstants = new Map<string, string>()

    for (const match of source.matchAll(tableConstantPattern)) {
      tableConstants.set(match[1], match[2])
    }

    for (const match of source.matchAll(createTablePattern)) {
      const tableName = match[1] ?? match[2] ?? tableConstants.get(match[3])
      if (!tableName || tableName.toUpperCase() === 'IF') {
        continue
      }

      const owners = tables.get(tableName) ?? new Set<string>()
      owners.add(relativeFile)
      tables.set(tableName, owners)
    }
  }

  return tables
}

const tableIsOwnedBySchema = (tableName: string, models: Map<string, string>) => {
  if (models.has(tableName)) {
    return true
  }

  for (const block of models.values()) {
    if (block.includes(`@@map("${tableName}")`)) {
      return true
    }
  }

  return false
}

test('Prisma owns the PostgreSQL datasource and all approved runtime-created tables', () => {
  const schema = readFileSync(schemaPath, 'utf8')
  const models = extractModelBlocks(schema)
  const missingOwnership: string[] = []

  assert.equal(getDatasourceProvider(schema), 'postgresql')

  for (const { modelName, mappedTableName } of requiredSchemaOwnedModels) {
    const block = models.get(modelName)
    if (!block) {
      missingOwnership.push(`${modelName} model is missing`)
      continue
    }

    if (block.includes('@@ignore')) {
      missingOwnership.push(`${modelName} model is ignored`)
    }

    if (mappedTableName && !block.includes(`@@map("${mappedTableName}")`)) {
      missingOwnership.push(`${modelName} must map ${mappedTableName}`)
    }
  }

  assert.deepEqual(missingOwnership, [])
})

test('runtime CREATE TABLE helpers cannot introduce tables outside Prisma ownership', () => {
  const schema = readFileSync(schemaPath, 'utf8')
  const models = extractModelBlocks(schema)
  const runtimeCreatedTables = extractRuntimeCreatedTables()

  const missingOwnership = [...runtimeCreatedTables.entries()]
    .filter(([tableName]) => !tableIsOwnedBySchema(tableName, models))
    .map(([tableName, files]) => `${tableName}: ${[...files].sort().join(', ')}`)
    .sort()

  assert.deepEqual(missingOwnership, [])
})

test('runtime source does not execute schema DDL or SQLite PRAGMAs', () => {
  const forbiddenPattern = /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN|CREATE\s+INDEX|PRAGMA)\b/i
  const violations = collectRuntimeSourceFiles(sourceRoot)
    .map((file) => {
      const source = readFileSync(file, 'utf8')
      const relativeFile = relative(sourceRoot, file).replace(/\\/g, '/')
      const lines = source.split(/\r?\n/)
      return lines
        .map((line, index) => ({
          line,
          lineNumber: index + 1
        }))
        .filter(({ line }) => forbiddenPattern.test(line))
        .map(({ lineNumber }) => `${relativeFile}:${lineNumber}`)
    })
    .flat()
    .sort()

  assert.deepEqual(violations, [])
})

test('runtime source does not import or emit the retired background database gate', () => {
  const forbiddenPattern = /database-workload-gate|withBackgroundDatabaseWork|background_database_gate_busy/
  const violations = collectRuntimeSourceFiles(sourceRoot)
    .map((file) => {
      const source = readFileSync(file, 'utf8')
      const relativeFile = relative(sourceRoot, file).replace(/\\/g, '/')
      const lines = source.split(/\r?\n/)
      return lines
        .map((line, index) => ({
          line,
          lineNumber: index + 1
        }))
        .filter(({ line }) => forbiddenPattern.test(line))
        .map(({ lineNumber }) => `${relativeFile}:${lineNumber}`)
    })
    .flat()
    .sort()

  assert.deepEqual(violations, [])
})

test('legacy manual SQL schema patches are not retained after PostgreSQL cutover', () => {
  const manualSqlPatches = readdirSync(prismaRoot)
    .filter((entry) => /^manual_.*\.sql$/.test(entry))
    .sort()

  assert.deepEqual(manualSqlPatches, [])
})
