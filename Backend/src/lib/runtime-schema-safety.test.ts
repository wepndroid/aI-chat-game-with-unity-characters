import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

const sourceRoot = join(__dirname, '..')

type RuntimeSchemaPattern = {
  pattern: RegExp
}

const runtimeSchemaPatterns: readonly RuntimeSchemaPattern[] = [
  { pattern: /DROP\s+TABLE/i },
  { pattern: /DROP\s+INDEX/i },
  { pattern: /ALTER\s+TABLE[\s\S]{0,160}RENAME\s+TO/i },
  { pattern: /CREATE\s+TABLE[\s\S]{0,160}__new/i },
  { pattern: /PRAGMA\s+foreign_keys\s*=\s*OFF/i },
  { pattern: /PRAGMA\s+writable_schema/i },
  { pattern: /VACUUM\s+INTO/i },
  { pattern: /ATTACH\s+DATABASE/i },
  { pattern: /DETACH\s+DATABASE/i },
  { pattern: /CREATE\s+UNIQUE\s+INDEX/i },
  { pattern: /CREATE\s+INDEX/i },
  { pattern: /CREATE\s+TABLE/i },
  { pattern: /ALTER\s+TABLE[\s\S]{0,160}ADD\s+COLUMN/i },
  { pattern: /PRAGMA/i }
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

test('runtime source does not perform destructive database schema rewrites', () => {
  const violations = []

  for (const file of collectRuntimeSourceFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8')
    const relativeFile = relative(sourceRoot, file).replace(/\\/g, '/')

    for (const { pattern } of runtimeSchemaPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeFile} matched ${pattern}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})
