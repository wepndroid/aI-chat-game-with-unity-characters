// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { PrismaClient } from '@prisma/client'
import { hasFlag, parseCliArgs, requireOption, runCli, UsageError } from './lib/cli'
import { createMigrationCommandWorkspace } from './lib/cutover-workspace'
import { validatePostgresImport } from './lib/import-executor'
import { readImportPolicyTimestampFromReport } from './lib/import-report-timestamp'
import { loadOptionalMigrationEnv, requireDatabaseUrl } from './lib/migration-env'
import { assertPostgresDatabaseUrl, parseDatabaseUrlForSafety } from './lib/postgres-target'
import { writeMigrationJsonReport } from './lib/report-writer'

const main = async () => {
  const args = parseCliArgs()
  const workspace = createMigrationCommandWorkspace({
    source: requireOption(args, 'source', 0),
    label: requireOption(args, 'label', 1),
    report: args.options.get('report') ?? process.env.npm_config_report,
    cutoverDir: args.options.get('cutover-dir') ?? process.env.npm_config_cutover_dir,
    allowProductionSource: hasFlag(args, 'allow-production-source')
  })
  const importReportPath = args.options.get('import-report') ?? process.env.npm_config_import_report
  if (workspace.mode === 'production-cutover' && !importReportPath?.trim()) {
    throw new UsageError('Production cutover validation requires --import-report.')
  }
  loadOptionalMigrationEnv()
  const databaseUrl = requireDatabaseUrl()
  assertPostgresDatabaseUrl(databaseUrl)
  const target = parseDatabaseUrlForSafety(databaseUrl, { allowProductionLikeName: hasFlag(args, 'allow-production-target') })
  const prisma = new PrismaClient()
  const generatedAt = new Date()
  const { importPolicyTimestamp } = await readImportPolicyTimestampFromReport({
    label: workspace.label,
    importReportPath: importReportPath?.trim(),
    reportRoot: importReportPath?.trim() ? workspace.reportRoot : undefined
  })

  try {
    const validation = await validatePostgresImport(
      prisma,
      workspace.sourcePath,
      importPolicyTimestamp,
      workspace.sourceBoundary
    )
    const reportPath = await writeMigrationJsonReport({
      reportRoot: workspace.reportRoot,
      reportPath: workspace.reportPath('postgres-import-validation.json'),
      data: {
        reportVersion: 1,
        generatedAt: generatedAt.toISOString(),
        importPolicyTimestamp: importPolicyTimestamp.toISOString(),
        mode: workspace.mode,
        target,
        ...validation
      }
    })

    console.log(`PostgreSQL import validation wrote ${reportPath}`)
    if (validation.mismatches.length > 0) {
      throw new Error(`PostgreSQL import validation failed: ${validation.mismatches.join('; ')}`)
    }

    console.log('PostgreSQL import validation passed.')
  } finally {
    await prisma.$disconnect()
  }
}

void runCli(main)
