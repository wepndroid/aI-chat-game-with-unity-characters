// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

type LoadMigrationEnvResult = {
  envPath: string | null
  loaded: boolean
}

const loadOptionalMigrationEnv = (backendRoot = process.cwd()): LoadMigrationEnvResult => {
  const envPath = resolve(backendRoot, '.env.migration')
  if (!existsSync(envPath)) {
    return {
      envPath: null,
      loaded: false
    }
  }

  config({ path: envPath, override: true })
  return {
    envPath,
    loaded: true
  }
}

const requireDatabaseUrl = () => {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) {
    throw new Error('DATABASE_URL is required for PostgreSQL migration tooling.')
  }

  return value
}

export { loadOptionalMigrationEnv, requireDatabaseUrl }
export type { LoadMigrationEnvResult }
