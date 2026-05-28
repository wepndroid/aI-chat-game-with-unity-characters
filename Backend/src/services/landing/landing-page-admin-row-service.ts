import { prisma } from '../../lib/prisma'

type LandingPageAdminRowDatabase = {
  $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>
}

type LandingPageAdminRow = {
  id: string
  key: string
  name: string
  description: string | null
  basePath: string | null
  isActive: boolean | number
  createdAt: Date | string
  updatedAt: Date | string
}

type LandingPageAdminRecord = {
  id: string
  key: string
  name: string
  description: string | null
  basePath: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const normalizeDatabaseBoolean = (value: boolean | number) => value === true || value === 1

const normalizeDatabaseDate = (value: Date | string) => (value instanceof Date ? value : new Date(value))

const normalizeLandingPageAdminRow = (row: LandingPageAdminRow): LandingPageAdminRecord => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  basePath: row.basePath,
  isActive: normalizeDatabaseBoolean(row.isActive),
  createdAt: normalizeDatabaseDate(row.createdAt),
  updatedAt: normalizeDatabaseDate(row.updatedAt)
})

const resolveLandingPageAdminRowDb = (db?: LandingPageAdminRowDatabase) =>
  db ?? (prisma as unknown as LandingPageAdminRowDatabase)

const listLandingPageAdminRows = async (input?: {
  db?: LandingPageAdminRowDatabase
}) => {
  const db = resolveLandingPageAdminRowDb(input?.db)
  const rows = await db.$queryRaw<LandingPageAdminRow[]>`
    SELECT
      "id",
      "key",
      "name",
      "description",
      "basePath",
      "isActive",
      "createdAt",
      "updatedAt"
    FROM "LandingPage"
    ORDER BY "createdAt" ASC, "id" ASC
  `

  return rows.map(normalizeLandingPageAdminRow)
}

export { listLandingPageAdminRows }
export type { LandingPageAdminRecord, LandingPageAdminRowDatabase }
