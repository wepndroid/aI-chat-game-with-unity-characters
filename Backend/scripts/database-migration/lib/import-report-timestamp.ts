// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { readFile } from 'node:fs/promises'
import { assertInsideDirectory, reportPathForLabel } from './paths'

type ImportPolicyTimestampResult = {
  importPolicyTimestamp: Date
  reportPath: string
}

type ImportPolicyTimestampParams = {
  label: string
  backendRoot?: string
  importReportPath?: string
  reportRoot?: string
}

const normalizeParams = (params: string | ImportPolicyTimestampParams, backendRoot?: string): Required<Pick<ImportPolicyTimestampParams, 'label'>> & Omit<ImportPolicyTimestampParams, 'label'> => {
  if (typeof params === 'string') {
    return { label: params, backendRoot }
  }

  return params
}

const readImportPolicyTimestampFromReport = async (
  paramsOrLabel: string | ImportPolicyTimestampParams,
  legacyBackendRoot = process.cwd()
): Promise<ImportPolicyTimestampResult> => {
  const params = normalizeParams(paramsOrLabel, legacyBackendRoot)
  const backendRoot = params.backendRoot ?? process.cwd()
  const reportPath =
    params.importReportPath && params.reportRoot
      ? assertInsideDirectory(
          params.importReportPath,
          params.reportRoot,
          'PostgreSQL import report path must stay inside the approved report root.'
        )
      : reportPathForLabel(params.label, 'postgres-import.json', backendRoot)
  let parsedReport: unknown

  try {
    parsedReport = JSON.parse(await readFile(reportPath, 'utf8'))
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(
      `PostgreSQL import report is required for fingerprint validation. Run db:pg:import with the same label before db:pg:validate. ${cause}`
    )
  }

  const generatedAt = (parsedReport as { generatedAt?: unknown }).generatedAt
  if (typeof generatedAt !== 'string') {
    throw new Error(`Invalid generatedAt in PostgreSQL import report ${reportPath}: missing string value.`)
  }

  const importPolicyTimestamp = new Date(generatedAt)
  if (Number.isNaN(importPolicyTimestamp.getTime())) {
    throw new Error(`Invalid generatedAt in PostgreSQL import report ${reportPath}: ${generatedAt}`)
  }

  return {
    importPolicyTimestamp,
    reportPath
  }
}

export { readImportPolicyTimestampFromReport }
export type { ImportPolicyTimestampResult }
