// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { PrismaClient } from '@prisma/client'
import { hasFlag, parseCliArgs, requireOption, runCli } from './lib/cli'
import { createMigrationCommandWorkspace } from './lib/cutover-workspace'
import { loadOptionalMigrationEnv, requireDatabaseUrl } from './lib/migration-env'
import { assertPostgresDatabaseUrl, assertTargetApplicationTablesEmpty, parseDatabaseUrlForSafety } from './lib/postgres-target'
import { writeMigrationJsonReport } from './lib/report-writer'
import { buildSourcePreflightSummary, assertSourcePreflightSummary } from './lib/import-executor'

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
    await prisma.$connect()
    const summary = await buildSourcePreflightSummary(workspace.sourcePath, generatedAt, {
      sourceBoundary: workspace.sourceBoundary
    })
    assertSourcePreflightSummary(summary)
    const targetEmptyCheck = await assertTargetApplicationTablesEmpty(prisma)
    const reportPath = await writeMigrationJsonReport({
      reportRoot: workspace.reportRoot,
      reportPath: workspace.reportPath('postgres-import-preflight.json'),
      data: {
        reportVersion: 1,
        generatedAt: generatedAt.toISOString(),
        mode: workspace.mode,
        target,
        targetEmptyCheck,
        ...summary
      }
    })

    console.log(`PostgreSQL import preflight wrote ${reportPath}`)
    console.log(`Source tables: ${summary.sourceTables.length}`)
    console.log(`Pending turns retained/skipped: ${summary.pendingTurns.retainedRows}/${summary.pendingTurns.skippedRows}`)
  } finally {
    await prisma.$disconnect()
  }
}

void runCli(main)
