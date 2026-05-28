// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { PrismaClient } from '@prisma/client'
import { hasFlag, parseCliArgs, requireOption, runCli } from './lib/cli'
import { createMigrationCommandWorkspace } from './lib/cutover-workspace'
import { importSqliteToPostgres } from './lib/import-executor'
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
  loadOptionalMigrationEnv()
  const databaseUrl = requireDatabaseUrl()
  assertPostgresDatabaseUrl(databaseUrl)
  const target = parseDatabaseUrlForSafety(databaseUrl, { allowProductionLikeName: hasFlag(args, 'allow-production-target') })
  const prisma = new PrismaClient()
  const generatedAt = new Date()

  try {
    const importReport = await importSqliteToPostgres(prisma, workspace.sourcePath, generatedAt, workspace.sourceBoundary)
    const reportPath = await writeMigrationJsonReport({
      reportRoot: workspace.reportRoot,
      reportPath: workspace.reportPath('postgres-import.json'),
      data: {
        reportVersion: 1,
        generatedAt: generatedAt.toISOString(),
        mode: workspace.mode,
        target,
        ...importReport
      }
    })

    const importedRows = importReport.importedTables.reduce((total, entry) => total + entry.importedRows, 0)
    console.log(`Imported SQLite source into PostgreSQL target ${target.database}.`)
    console.log(`Imported rows: ${importedRows}`)
    console.log(`PostgreSQL import report wrote ${reportPath}`)
  } finally {
    await prisma.$disconnect()
  }
}

void runCli(main)
