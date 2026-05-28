// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { createHash } from 'node:crypto'

type TargetRow = Record<string, unknown>

type CanonicalValue =
  | { type: 'array'; value: CanonicalValue[] }
  | { type: 'bigint'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'null' }
  | { type: 'number'; value: number }
  | { type: 'object'; value: CanonicalRow }
  | { type: 'string'; value: string }

type CanonicalRow = Record<string, CanonicalValue>

type TableFingerprint = {
  fingerprint: string
  rowCount: number
  targetModel: string
}

const fingerprintVersion = 'secretwaifu-postgres-import-table-fingerprint-v1'

const hashText = (value: string) => createHash('sha256').update(value).digest('hex')

const canonicalizeValue = (value: unknown, fieldPath: string): CanonicalValue => {
  if (value === undefined) {
    throw new Error(`Cannot fingerprint undefined value at ${fieldPath}.`)
  }

  if (value === null) {
    return { type: 'null' }
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Cannot fingerprint invalid Date at ${fieldPath}.`)
    }

    return { type: 'date', value: value.toISOString() }
  }

  if (typeof value === 'bigint') {
    return { type: 'bigint', value: value.toString() }
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean', value }
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot fingerprint non-finite number at ${fieldPath}.`)
    }

    return { type: 'number', value }
  }

  if (typeof value === 'string') {
    return { type: 'string', value }
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      value: value.map((entry, index) => canonicalizeValue(entry, `${fieldPath}[${index}]`))
    }
  }

  if (typeof value === 'object') {
    return {
      type: 'object',
      value: canonicalizeRow(value as TargetRow, fieldPath)
    }
  }

  throw new Error(`Cannot fingerprint unsupported value at ${fieldPath}: ${typeof value}.`)
}

const canonicalizeRow = (row: TargetRow, fieldPath = '$'): CanonicalRow => {
  const canonical: CanonicalRow = {}
  for (const key of Object.keys(row).sort()) {
    canonical[key] = canonicalizeValue(row[key], fieldPath === '$' ? key : `${fieldPath}.${key}`)
  }

  return canonical
}

const canonicalJson = (row: TargetRow) => JSON.stringify(canonicalizeRow(row))

const buildTableFingerprint = (targetModel: string, rows: readonly TargetRow[]): TableFingerprint => {
  const rowHashes = rows.map((row) => hashText(canonicalJson(row))).sort()
  const aggregateInput = JSON.stringify({
    version: fingerprintVersion,
    targetModel,
    rowCount: rowHashes.length,
    rowHashes
  })

  // Only the aggregate hash leaves this module's public summary. That keeps
  // validation reports useful for drift detection without exposing migrated row data.
  return {
    fingerprint: hashText(aggregateInput),
    rowCount: rowHashes.length,
    targetModel
  }
}

export { buildTableFingerprint, canonicalizeRow, canonicalizeValue }
export type { CanonicalRow, CanonicalValue, TableFingerprint, TargetRow }
