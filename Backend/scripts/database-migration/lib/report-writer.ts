// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { assertInsideDirectory, assertInsideLabReports } from './paths'
import { redactMigrationValue } from './redaction'

type WriteMigrationJsonReportParams = {
  backendRoot?: string
  reportRoot?: string
  reportPath: string
  data: unknown
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry))
  }

  if (value && typeof value === 'object') {
    const sortedObject: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sortedObject[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return sortedObject
  }

  return value
}

const writeMigrationJsonReport = async (params: WriteMigrationJsonReportParams) => {
  const backendRoot = params.backendRoot ?? process.cwd()
  const reportPath = params.reportRoot
    ? assertInsideDirectory(params.reportPath, params.reportRoot, 'Migration report path must stay inside the approved report root.')
    : assertInsideLabReports(params.reportPath, backendRoot)
  const safeData = canonicalize(redactMigrationValue(params.data))

  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(safeData, null, 2)}\n`, 'utf8')

  return reportPath
}

export { writeMigrationJsonReport }
