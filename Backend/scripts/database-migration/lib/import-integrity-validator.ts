// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import type { PrismaClient } from '@prisma/client'
import type { DerivedImportPlanEntry, ImportPlanEntry } from './table-import-plan'
import type { TargetRow } from './prisma-row-converter'
import { readTargetRowsForModel } from './postgres-target'
import { buildTableFingerprint } from './row-fingerprint'

type FingerprintPlanEntry = ImportPlanEntry | DerivedImportPlanEntry

type TableFingerprintValidation = {
  targetModel: string
  sourceTable: string
  mode: FingerprintPlanEntry['mode']
  expectedCount: number
  actualCount: number
  expectedFingerprint: string
  actualFingerprint: string
  matches: boolean
}

type ImportRowFingerprintValidationResult = {
  fingerprintValidations: TableFingerprintValidation[]
  mismatches: string[]
}

const compareTableFingerprint = (
  entry: FingerprintPlanEntry,
  expectedRows: readonly TargetRow[],
  actualRows: readonly TargetRow[]
): TableFingerprintValidation => {
  const expected = buildTableFingerprint(entry.targetModel, expectedRows)
  const actual = buildTableFingerprint(entry.targetModel, actualRows)

  return {
    targetModel: entry.targetModel,
    sourceTable: entry.sourceTable,
    mode: entry.mode,
    expectedCount: expected.rowCount,
    actualCount: actual.rowCount,
    expectedFingerprint: expected.fingerprint,
    actualFingerprint: actual.fingerprint,
    matches: expected.rowCount === actual.rowCount && expected.fingerprint === actual.fingerprint
  }
}

const formatFingerprintMismatch = (validation: TableFingerprintValidation): string | null => {
  if (validation.matches) {
    return null
  }

  if (validation.expectedCount !== validation.actualCount) {
    return `${validation.targetModel}: expected ${validation.expectedCount} rows, got ${validation.actualCount}`
  }

  return `${validation.targetModel}: fingerprint mismatch with ${validation.expectedCount} expected rows and ${validation.actualCount} actual rows`
}

const validateImportRowFingerprints = async (
  prisma: PrismaClient,
  expectedRowsByModel: Record<string, TargetRow[]>,
  entries: readonly FingerprintPlanEntry[]
): Promise<ImportRowFingerprintValidationResult> => {
  const fingerprintValidations: TableFingerprintValidation[] = []

  for (const entry of entries) {
    const expectedRows = expectedRowsByModel[entry.targetModel]
    if (!expectedRows) {
      throw new Error(`Missing expected rows for fingerprint validation target ${entry.targetModel}.`)
    }

    const actualRows = await readTargetRowsForModel(prisma, entry.delegateName, entry.targetModel)
    fingerprintValidations.push(compareTableFingerprint(entry, expectedRows, actualRows))
  }

  return {
    fingerprintValidations,
    mismatches: fingerprintValidations
      .map((validation) => formatFingerprintMismatch(validation))
      .filter((message): message is string => message !== null)
  }
}

export { compareTableFingerprint, formatFingerprintMismatch, validateImportRowFingerprints }
export type { FingerprintPlanEntry, ImportRowFingerprintValidationResult, TableFingerprintValidation }
