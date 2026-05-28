// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import type { PrismaClient } from '@prisma/client'
import { getScalarFieldsForModel, type TargetRow } from './prisma-row-converter'

type DatabaseUrlSafety = {
  protocol: string
  host: string
  port: string
  database: string
}

type ParseDatabaseUrlOptions = {
  allowProductionLikeName?: boolean
}

type ApplicationTableCount = {
  table_name: string
  row_count: bigint | number | string
}

type EmptyTargetAssertion = {
  checkedTables: number
}

type PrismaFindManyDelegate = {
  findMany: (args: { select: Record<string, true> }) => Promise<TargetRow[]>
}

const assertPostgresDatabaseUrl = (value: string) => {
  const protocol = new URL(value).protocol
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error('PostgreSQL DATABASE_URL is required for PostgreSQL import tooling.')
  }
}

const parseDatabaseUrlForSafety = (value: string, options: ParseDatabaseUrlOptions = {}): DatabaseUrlSafety => {
  assertPostgresDatabaseUrl(value)
  const url = new URL(value)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!database) {
    throw new Error('PostgreSQL DATABASE_URL must include a database name.')
  }

  if (!options.allowProductionLikeName && /prod|production|live/i.test(database)) {
    throw new Error(`Refusing production-like database name without explicit override: ${database}`)
  }

  return {
    protocol: url.protocol,
    host: url.hostname,
    port: url.port || '5432',
    database
  }
}

const buildApplicationTableCountSql = () => `
SELECT table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name <> '_prisma_migrations'
ORDER BY table_name
`

const toCountNumber = (value: bigint | number | string) => Number(value)

const getApplicationTableCounts = async (prisma: PrismaClient): Promise<ApplicationTableCount[]> => {
  return prisma.$queryRawUnsafe<ApplicationTableCount[]>(buildApplicationTableCountSql())
}

const assertTargetApplicationTablesEmpty = async (prisma: PrismaClient): Promise<EmptyTargetAssertion> => {
  const counts = await getApplicationTableCounts(prisma)
  const nonEmptyTables = counts.filter((entry) => toCountNumber(entry.row_count) > 0)
  if (nonEmptyTables.length > 0) {
    throw new Error(
      `Target PostgreSQL database is not empty: ${nonEmptyTables
        .map((entry) => `${entry.table_name}=${String(entry.row_count)}`)
        .join(', ')}`
    )
  }

  return {
    checkedTables: counts.length
  }
}

const getFindManyDelegate = (prisma: PrismaClient, delegateName: string): PrismaFindManyDelegate => {
  const delegate = (prisma as unknown as Record<string, unknown>)[delegateName] as PrismaFindManyDelegate | undefined
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new Error(`Prisma delegate findMany is not available for ${delegateName}. Run prisma generate after schema changes.`)
  }

  return delegate
}

const buildScalarFieldSelectForModel = (targetModel: string): Record<string, true> =>
  Object.fromEntries(getScalarFieldsForModel(targetModel).map((field) => [field.name, true]))

const readTargetRowsForModel = async (
  prisma: PrismaClient,
  delegateName: string,
  targetModel: string
): Promise<TargetRow[]> => getFindManyDelegate(prisma, delegateName).findMany({ select: buildScalarFieldSelectForModel(targetModel) })

export {
  assertPostgresDatabaseUrl,
  assertTargetApplicationTablesEmpty,
  buildApplicationTableCountSql,
  buildScalarFieldSelectForModel,
  getApplicationTableCounts,
  parseDatabaseUrlForSafety,
  readTargetRowsForModel
}
export type { ApplicationTableCount, DatabaseUrlSafety, EmptyTargetAssertion, ParseDatabaseUrlOptions, PrismaFindManyDelegate }
