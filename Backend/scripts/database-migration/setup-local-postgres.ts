// Migration lifecycle: final-migration-required. Disposal checkpoint: post-cutover repository cleanup unless promoted to permanent maintenance tooling.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { parseCliArgs, runCli } from './lib/cli'
import { reportPathForLabel } from './lib/paths'
import { writeMigrationJsonReport } from './lib/report-writer'
import { assertToolSucceeded, runTool } from './lib/tool-runner'

type LocalPostgresTarget = {
  envName: 'DATABASE_URL' | 'SHADOW_DATABASE_URL'
  url: URL
  host: string
  port: string
  user: string
  password: string
  database: string
}

type DatabaseSetupResult = {
  envName: string
  host: string
  port: string
  user: string
  database: string
  existedBefore: boolean
  reachable: boolean
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
const forbiddenDatabaseNames = new Set(['postgres', 'template0', 'template1'])

const escapeSqlString = (value: string) => value.replace(/'/g, "''")

const assertSafeLocalDatabaseName = (database: string) => {
  const normalized = database.toLowerCase()
  if (!database || forbiddenDatabaseNames.has(normalized) || /prod|production|live/.test(normalized)) {
    throw new Error(`Refusing to manage unsafe PostgreSQL database name for local lab: ${database}`)
  }
}

const parseLocalPostgresUrl = (envName: LocalPostgresTarget['envName']) => {
  const value = process.env[envName]?.trim()
  if (!value) {
    throw new Error(`${envName} is required in .env.migration.`)
  }

  if (value.includes('REPLACE_ME')) {
    throw new Error(`${envName} still contains REPLACE_ME. Fill .env.migration with local-only credentials first.`)
  }

  const url = new URL(value)
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${envName} must be a PostgreSQL URL.`)
  }

  if (!localHosts.has(url.hostname)) {
    throw new Error(`${envName} must point to localhost, 127.0.0.1, or ::1. Received host: ${url.hostname}`)
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  assertSafeLocalDatabaseName(database)

  return {
    envName,
    url,
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password),
    database
  }
}

const envForTarget = (target: LocalPostgresTarget): NodeJS.ProcessEnv => ({
  ...process.env,
  ...(target.password ? { PGPASSWORD: target.password } : {})
})

const psqlConnectionArgs = (target: LocalPostgresTarget, database: string) => [
  '--host',
  target.host,
  '--port',
  target.port,
  '--username',
  target.user,
  '--no-password',
  '--dbname',
  database,
  '--no-align',
  '--tuples-only'
]

const databaseExists = async (target: LocalPostgresTarget) => {
  const result = await runTool(
    'psql',
    [
      ...psqlConnectionArgs(target, 'postgres'),
      '--command',
      `SELECT 1 FROM pg_database WHERE datname = '${escapeSqlString(target.database)}'`
    ],
    { env: envForTarget(target) }
  )
  assertToolSucceeded(result, `${target.envName} existence check`)

  return result.stdout.trim() === '1'
}

const createDatabase = async (target: LocalPostgresTarget) => {
  const result = await runTool(
    'createdb',
    [
      '--host',
      target.host,
      '--port',
      target.port,
      '--username',
      target.user,
      '--no-password',
      target.database
    ],
    { env: envForTarget(target) }
  )
  assertToolSucceeded(result, `${target.envName} database creation`)
}

const assertPostgresReady = async (target: LocalPostgresTarget) => {
  const result = await runTool('pg_isready', ['--host', target.host, '--port', target.port, '--username', target.user], {
    env: envForTarget(target)
  })
  assertToolSucceeded(result, `${target.envName} PostgreSQL readiness check`)
}

const assertDatabaseReachable = async (target: LocalPostgresTarget) => {
  const result = await runTool(
    'psql',
    [...psqlConnectionArgs(target, target.database), '--command', 'SELECT current_database()'],
    { env: envForTarget(target) }
  )
  assertToolSucceeded(result, `${target.envName} reachability check`)

  if (result.stdout.trim() !== target.database) {
    throw new Error(`${target.envName} reachability check returned an unexpected database.`)
  }
}

const ensureDatabase = async (target: LocalPostgresTarget): Promise<DatabaseSetupResult> => {
  await assertPostgresReady(target)
  const existedBefore = await databaseExists(target)
  if (!existedBefore) {
    await createDatabase(target)
  }
  await assertDatabaseReachable(target)

  return {
    envName: target.envName,
    host: target.host,
    port: target.port,
    user: target.user,
    database: target.database,
    existedBefore,
    reachable: true
  }
}

const main = async () => {
  parseCliArgs()

  const envPath = resolve(process.cwd(), '.env.migration')
  if (!existsSync(envPath)) {
    throw new Error('Missing .env.migration. Copy .env.migration.example to .env.migration and fill local-only credentials.')
  }

  config({ path: envPath, override: true })

  const databaseTarget = parseLocalPostgresUrl('DATABASE_URL')
  const shadowDatabaseTarget = parseLocalPostgresUrl('SHADOW_DATABASE_URL')
  const results = [await ensureDatabase(databaseTarget), await ensureDatabase(shadowDatabaseTarget)]
  const reportPath = await writeMigrationJsonReport({
    reportPath: reportPathForLabel('local-postgres', 'setup.json'),
    data: {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      results
    }
  })

  console.log(`Local PostgreSQL lab setup wrote ${reportPath}`)
  for (const result of results) {
    console.log(`${result.envName}: database=${result.database} host=${result.host}:${result.port} existed=${result.existedBefore}`)
  }
}

void runCli(main)
