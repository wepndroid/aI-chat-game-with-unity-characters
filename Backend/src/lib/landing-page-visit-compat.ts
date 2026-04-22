import { prisma } from './prisma'

let signupClickColumnEnsured = false

const isSqliteDatabase = () => {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''
  return databaseUrl.startsWith('file:')
}

const ensureLandingPageSignupClickColumn = async () => {
  if (signupClickColumnEnsured || !isSqliteDatabase()) {
    return
  }

  const tableInfo = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info('LandingPageVisit')`)
  const existingColumns = new Set(tableInfo.map((column) => column.name))

  if (!existingColumns.has('signupClickedAt')) {
    await prisma.$executeRawUnsafe('ALTER TABLE LandingPageVisit ADD COLUMN signupClickedAt DATETIME')
  }

  signupClickColumnEnsured = true
}

export { ensureLandingPageSignupClickColumn }
