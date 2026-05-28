// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { platform } from 'node:os'
import { hasFlag, parseCliArgs, requireOption, runCli, UsageError } from './lib/cli'
import { resolveCutoverDirectory } from './lib/cutover-workspace'
import { calculateFileSha256 } from './lib/file-hash'
import { assertInsideDirectory, parseSafeLabel } from './lib/paths'
import { redactLocalPath } from './lib/redaction'
import { writeMigrationJsonReport } from './lib/report-writer'
import { resolveExplicitSqliteSourcePath, resolveSqliteSourcePathFromEnvFile } from './lib/sqlite-database-url'
import { assertToolSucceeded, runTool } from './lib/tool-runner'

const SNAPSHOT_FILE_NAME = 'prod.sqlite.before-postgresql.db'
const REPORT_FILE_NAME = 'sqlite-snapshot-report.json'

const resolvePythonCommand = () => process.env.PYTHON?.trim() || (platform() === 'win32' ? 'python' : 'python3')

const resolveSnapshotSourcePath = async (args: ReturnType<typeof parseCliArgs>) => {
  const sqlitePath = (args.options.get('sqlite-path') ?? process.env.npm_config_sqlite_path)?.trim()
  const sqliteUrlEnvFile = (args.options.get('sqlite-url-env-file') ?? process.env.npm_config_sqlite_url_env_file)?.trim()

  if (sqlitePath && sqliteUrlEnvFile) {
    throw new UsageError('Use either --sqlite-path or --sqlite-url-env-file, not both.')
  }

  if (!sqlitePath && !sqliteUrlEnvFile) {
    throw new UsageError('Missing SQLite source. Provide --sqlite-path or --sqlite-url-env-file.')
  }

  if (sqlitePath) {
    return {
      sourcePath: resolveExplicitSqliteSourcePath({ sqlitePath }),
      sourceKind: 'sqlite-path' as const,
      envFilePath: null
    }
  }

  const result = await resolveSqliteSourcePathFromEnvFile({ envFile: sqliteUrlEnvFile! })
  return {
    sourcePath: result.sourcePath,
    sourceKind: 'sqlite-url-env-file' as const,
    envFilePath: result.envFilePath
  }
}

const parseBackupStatus = (stdout: string) => {
  try {
    return JSON.parse(stdout) as {
      integrityCheck: string
      pageCount: number
      pageSize: number
      sqliteVersion: string
    }
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(`SQLite backup helper returned invalid JSON: ${cause}`)
  }
}

const main = async () => {
  const args = parseCliArgs()
  const label = parseSafeLabel(requireOption(args, 'label'))
  const cutoverDir = resolveCutoverDirectory({ cutoverDir: requireOption(args, 'cutover-dir') })
  const showLocalPaths = hasFlag(args, 'show-local-paths')
  const source = await resolveSnapshotSourcePath(args)
  const snapshotPath = assertInsideDirectory(
    join(cutoverDir, SNAPSHOT_FILE_NAME),
    cutoverDir,
    'SQLite snapshot path must stay inside the cutover directory.'
  )

  if (resolve(source.sourcePath) === resolve(snapshotPath)) {
    throw new UsageError('SQLite source and snapshot destination must be different files.')
  }

  await mkdir(cutoverDir, { recursive: true })

  const pythonCommand = resolvePythonCommand()
  const pythonVersion = await runTool(pythonCommand, ['--version'], { redactOutput: false })
  assertToolSucceeded(pythonVersion, 'Python version check')

  const backupTool = join(process.cwd(), 'scripts', 'database-migration', 'tools', 'sqlite_backup.py')
  const backupResult = await runTool(pythonCommand, [backupTool, source.sourcePath, snapshotPath], {
    redactOutput: false,
    timeoutMs: 120000
  })
  assertToolSucceeded(backupResult, 'SQLite snapshot backup')

  const backupStatus = parseBackupStatus(backupResult.stdout)
  const snapshotStats = await stat(snapshotPath)
  const snapshotSha256 = await calculateFileSha256(snapshotPath)
  const checksumPath = assertInsideDirectory(
    join(cutoverDir, `${SNAPSHOT_FILE_NAME}.sha256`),
    cutoverDir,
    'SQLite snapshot checksum path must stay inside the cutover directory.'
  )
  await writeFile(checksumPath, `${snapshotSha256}  ${SNAPSHOT_FILE_NAME}\n`, 'utf8')

  const reportPath = await writeMigrationJsonReport({
    reportRoot: cutoverDir,
    reportPath: join(cutoverDir, REPORT_FILE_NAME),
    data: {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      label,
      source: {
        kind: source.sourceKind,
        path: redactLocalPath(source.sourcePath, showLocalPaths),
        envFilePath: source.envFilePath ? redactLocalPath(source.envFilePath, showLocalPaths) : null
      },
      snapshot: {
        fileName: SNAPSHOT_FILE_NAME,
        path: redactLocalPath(snapshotPath, showLocalPaths),
        checksumFileName: `${SNAPSHOT_FILE_NAME}.sha256`,
        sha256: snapshotSha256,
        sizeBytes: snapshotStats.size,
        integrityCheck: backupStatus.integrityCheck,
        pageCount: backupStatus.pageCount,
        pageSize: backupStatus.pageSize
      },
      tools: {
        nodeVersion: process.version,
        pythonCommand,
        pythonVersion: (pythonVersion.stdout || pythonVersion.stderr).trim(),
        sqliteVersion: backupStatus.sqliteVersion
      }
    }
  })

  console.log(`SQLite snapshot wrote ${snapshotPath}`)
  console.log(`SQLite snapshot SHA-256 wrote ${checksumPath}`)
  console.log(`SQLite snapshot report wrote ${reportPath}`)
}

void runCli(main)
