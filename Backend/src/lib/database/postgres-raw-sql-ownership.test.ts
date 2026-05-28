import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const backendRoot = join(__dirname, '..', '..', '..')
const sourceRoot = join(backendRoot, 'src')
const postgresSqlBoundaryPath = 'lib/database/postgres-sql.ts'

const unsafeRawSqlAllowList = new Map<string, string>([
  [
    'lib/game-release-service.ts',
    'Fixed internal read-model SELECT joins a Prisma-owned table with optional NewsArticle metadata.'
  ],
  [
    'services/email-template-service.ts',
    'Fixed internal admin read queries over Prisma-owned marketing template/send-log tables.'
  ],
  [
    'services/static-page-service.ts',
    'Fixed internal admin/public read-model queries over the Prisma-owned StaticPages table.'
  ]
])

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

const toSourceRelativePath = (file: string) => relative(sourceRoot, file).replace(/\\/g, '/')

const getRuntimeSourceLines = () =>
  collectRuntimeSourceFiles(sourceRoot).flatMap((file) => {
    const relativeFile = toSourceRelativePath(file)
    return readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line, index) => ({
        line,
        lineNumber: index + 1,
        relativeFile
      }))
  })

test('PostgreSQL type casts are centralized in the database raw-SQL boundary', () => {
  const forbiddenCastPattern = /::(?:jsonb|timestamptz|"[A-Za-z][A-Za-z0-9_]*")/
  const violations = getRuntimeSourceLines()
    .filter(({ relativeFile }) => relativeFile !== postgresSqlBoundaryPath)
    .filter(({ line }) => forbiddenCastPattern.test(line))
    .map(({ relativeFile, lineNumber }) => `${relativeFile}:${lineNumber}`)
    .sort()

  assert.deepEqual(violations, [])
})

test('unsafe Prisma raw SQL calls stay explicit and documented', () => {
  const unsafeRawPattern = /\$[a-zA-Z]+RawUnsafe\b/
  const unsafeFiles = new Map<string, number[]>()

  for (const { line, lineNumber, relativeFile } of getRuntimeSourceLines()) {
    if (!unsafeRawPattern.test(line)) {
      continue
    }

    const lines = unsafeFiles.get(relativeFile) ?? []
    lines.push(lineNumber)
    unsafeFiles.set(relativeFile, lines)
  }

  const undocumentedFiles = [...unsafeFiles.keys()]
    .filter((relativeFile) => !unsafeRawSqlAllowList.has(relativeFile))
    .sort()
  const staleAllowListEntries = [...unsafeRawSqlAllowList.keys()]
    .filter((relativeFile) => !unsafeFiles.has(relativeFile))
    .sort()

  assert.deepEqual(
    undocumentedFiles.map((relativeFile) => `${relativeFile}: ${unsafeFiles.get(relativeFile)?.join(', ')}`),
    []
  )
  assert.deepEqual(staleAllowListEntries, [])
})

test('tagged Prisma SQL files do not embed manual PostgreSQL positional placeholders', () => {
  const manualPostgresPlaceholderPattern = /\$[1-9]\d*\b/
  const taggedPrismaSqlStartPattern = /(?:Prisma\.sql|[\w.]+\.\$(?:queryRaw|executeRaw))(?:<[^`]+>)?\s*`/
  const violations: string[] = []
  const countBackticks = (value: string) => [...value].filter((character) => character === '`').length

  for (const file of collectRuntimeSourceFiles(sourceRoot)) {
    const relativeFile = toSourceRelativePath(file)
    const content = readFileSync(file, 'utf8')

    if (unsafeRawSqlAllowList.has(relativeFile)) {
      continue
    }

    let insideTaggedPrismaSql = false

    content.split(/\r?\n/).forEach((line, index) => {
      let templateLine = line

      if (!insideTaggedPrismaSql) {
        const startMatch = taggedPrismaSqlStartPattern.exec(line)
        if (!startMatch) {
          return
        }

        templateLine = line.slice(startMatch.index)
        insideTaggedPrismaSql = countBackticks(templateLine) % 2 === 1
      } else if (countBackticks(templateLine) % 2 === 1) {
        insideTaggedPrismaSql = false
      }

      if (manualPostgresPlaceholderPattern.test(line)) {
        violations.push(`${relativeFile}:${index + 1}`)
      }
    })
  }

  assert.deepEqual(violations.sort(), [])
})
