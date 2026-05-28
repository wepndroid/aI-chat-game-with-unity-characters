import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { postgresTimestamptzValue } from '../../lib/database/postgres-sql'

const DEFAULT_HOMEPAGE_SETTING_ID = 'default-homepage'
const LEGACY_HOMEPAGE_KEY = 'home'
const HOMEPAGE_VARIANT_1_KEY = 'home1'
const HOMEPAGE_VARIANT_1_NAME = 'Homepage Variant 1'
const HOMEPAGE_VARIANT_1_PATH = '/'
const FALLBACK_DEFAULT_HOMEPAGE_KEY = 'home2'
const FALLBACK_DEFAULT_HOMEPAGE_NAME = 'Homepage Variant 2'
const FALLBACK_DEFAULT_HOMEPAGE_PATH = '/home2'
const DEFAULT_VARIANT_KEY = 'default'
const DEFAULT_VARIANT_NAME = 'Default Route'
const defaultHomepageTimestamp = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)

type DefaultHomepageLandingPage = {
  id: string
  key: string
  name: string
  basePath: string | null
  isActive: boolean
}

type DefaultHomepageSetting = {
  landingPage: DefaultHomepageLandingPage | null
  fallbackKey: string
  fallbackPath: string
}

type DefaultHomepageLandingPageReader = {
  findUnique: (query: {
    where: {
      id: string
    }
    select: {
      id: true
      key: true
      name: true
      basePath: true
      isActive: true
    }
  }) => Promise<DefaultHomepageLandingPage | null>
}

type DefaultHomepageDatabase = {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
  $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>
  landingPage: DefaultHomepageLandingPageReader
}

type DefaultHomepageServiceOptions = {
  db?: DefaultHomepageDatabase
  now?: Date
}

const normalizeDatabaseBoolean = (value: boolean | number) => value === true || value === 1

const resolveDefaultHomepageDatabase = (db?: DefaultHomepageDatabase) => db ?? (prisma as unknown as DefaultHomepageDatabase)

const ensureSystemHomepageVariant = async (
  transaction: Prisma.TransactionClient,
  landingPageId: string,
  routePath: string
) => {
  await transaction.landingPageVariant.upsert({
    where: {
      landingPageId_key: {
        landingPageId,
        key: DEFAULT_VARIANT_KEY
      }
    },
    create: {
      landingPageId,
      key: DEFAULT_VARIANT_KEY,
      name: DEFAULT_VARIANT_NAME,
      routePath,
      isControl: true,
      isActive: true
    },
    update: {
      name: DEFAULT_VARIANT_NAME,
      routePath,
      isControl: true,
      isActive: true
    }
  })
}

/**
 * Keeps the built-in homepage catalog aligned with the frontend route identities.
 * The public tracker is intentionally catalog-only, so boot repair owns the
 * system rows that let `/` and `/home2` report into separate analytics buckets.
 */
const ensureSystemHomepageCatalog = async () => {
  await prisma.$transaction(async (transaction) => {
    let homepageVariant1 = await transaction.landingPage.findUnique({
      where: {
        key: HOMEPAGE_VARIANT_1_KEY
      },
      select: {
        id: true,
        basePath: true
      }
    })

    if (!homepageVariant1) {
      const legacyHomepage = await transaction.landingPage.findUnique({
        where: {
          key: LEGACY_HOMEPAGE_KEY
        },
        select: {
          id: true,
          basePath: true
        }
      })

      if (legacyHomepage?.basePath === HOMEPAGE_VARIANT_1_PATH) {
        homepageVariant1 = await transaction.landingPage.update({
          where: {
            id: legacyHomepage.id
          },
          data: {
            key: HOMEPAGE_VARIANT_1_KEY,
            name: HOMEPAGE_VARIANT_1_NAME,
            basePath: HOMEPAGE_VARIANT_1_PATH,
            isActive: true
          },
          select: {
            id: true,
            basePath: true
          }
        })
      }
    }

    if (!homepageVariant1) {
      homepageVariant1 = await transaction.landingPage.create({
        data: {
          key: HOMEPAGE_VARIANT_1_KEY,
          name: HOMEPAGE_VARIANT_1_NAME,
          basePath: HOMEPAGE_VARIANT_1_PATH,
          isActive: true
        },
        select: {
          id: true,
          basePath: true
        }
      })
    }

    const homepageVariant2 = await transaction.landingPage.upsert({
      where: {
        key: FALLBACK_DEFAULT_HOMEPAGE_KEY
      },
      create: {
        key: FALLBACK_DEFAULT_HOMEPAGE_KEY,
        name: FALLBACK_DEFAULT_HOMEPAGE_NAME,
        basePath: FALLBACK_DEFAULT_HOMEPAGE_PATH,
        isActive: true
      },
      update: {
        name: FALLBACK_DEFAULT_HOMEPAGE_NAME,
        basePath: FALLBACK_DEFAULT_HOMEPAGE_PATH,
        isActive: true
      },
      select: {
        id: true,
        basePath: true
      }
    })

    await ensureSystemHomepageVariant(transaction, homepageVariant1.id, HOMEPAGE_VARIANT_1_PATH)
    await ensureSystemHomepageVariant(transaction, homepageVariant2.id, FALLBACK_DEFAULT_HOMEPAGE_PATH)
  })
}

const toDefaultHomepageLandingPage = (row: {
  id: string
  key: string
  name: string
  basePath: string | null
  isActive: boolean | number
}): DefaultHomepageLandingPage => ({
  id: row.id,
  key: row.key,
  name: row.name,
  basePath: row.basePath,
  isActive: normalizeDatabaseBoolean(row.isActive)
})

const getDefaultHomepageSetting = async (options?: Pick<DefaultHomepageServiceOptions, 'db'>): Promise<DefaultHomepageSetting> => {
  const db = resolveDefaultHomepageDatabase(options?.db)

  const rows = await db.$queryRaw<
    Array<{
      id: string | null
      key: string | null
      name: string | null
      basePath: string | null
      isActive: boolean | number | null
    }>
  >`
    SELECT
      landingPage."id",
      landingPage."key",
      landingPage."name",
      landingPage."basePath",
      landingPage."isActive"
    FROM "SiteHomepageSettings" settings
    LEFT JOIN "LandingPage" landingPage ON landingPage."id" = settings."landingPageId"
    WHERE settings."id" = ${DEFAULT_HOMEPAGE_SETTING_ID}
    LIMIT 1
  `
  const row = rows[0]

  if (!row?.id || !row.key || !row.name || row.isActive === null) {
    return {
      landingPage: null,
      fallbackKey: FALLBACK_DEFAULT_HOMEPAGE_KEY,
      fallbackPath: FALLBACK_DEFAULT_HOMEPAGE_PATH
    }
  }

  return {
    landingPage: toDefaultHomepageLandingPage({
      id: row.id,
      key: row.key,
      name: row.name,
      basePath: row.basePath,
      isActive: row.isActive
    }),
    fallbackKey: FALLBACK_DEFAULT_HOMEPAGE_KEY,
    fallbackPath: FALLBACK_DEFAULT_HOMEPAGE_PATH
  }
}

const resolveSelectableDefaultHomepage = async (db: DefaultHomepageDatabase, landingPageId: string) => {
  const landingPage = await db.landingPage.findUnique({
    where: {
      id: landingPageId
    },
    select: {
      id: true,
      key: true,
      name: true,
      basePath: true,
      isActive: true
    }
  })

  if (!landingPage) {
    throw new Error('Landing page was not found.')
  }

  if (!landingPage.isActive || !landingPage.basePath) {
    throw new Error('Default homepage must be an active landing page with a base path.')
  }

  return landingPage
}

const writeDefaultHomepageSetting = async (
  db: DefaultHomepageDatabase,
  landingPageId: string | null,
  now: Date
) => {
  const nowIso = now.toISOString()

  await db.$executeRaw`
    INSERT INTO "SiteHomepageSettings" ("id", "landingPageId", "createdAt", "updatedAt")
    VALUES (${DEFAULT_HOMEPAGE_SETTING_ID}, ${landingPageId}, ${defaultHomepageTimestamp(nowIso)}, ${defaultHomepageTimestamp(nowIso)})
    ON CONFLICT ("id") DO UPDATE SET
      "landingPageId" = excluded."landingPageId",
      "updatedAt" = excluded."updatedAt"
  `
}

const updateDefaultHomepageSetting = async (
  landingPageId: string | null,
  options?: DefaultHomepageServiceOptions
) => {
  const db = resolveDefaultHomepageDatabase(options?.db)
  const now = options?.now ?? new Date()

  if (landingPageId === null) {
    // `null` is an explicit admin choice to restore the built-in fallback route.
    // It is persisted as NULL rather than treated as an omitted patch field.
    await writeDefaultHomepageSetting(db, null, now)
    return getDefaultHomepageSetting({ db })
  }

  const landingPage = await resolveSelectableDefaultHomepage(db, landingPageId)
  await writeDefaultHomepageSetting(db, landingPage.id, now)

  return getDefaultHomepageSetting({ db })
}

export {
  FALLBACK_DEFAULT_HOMEPAGE_KEY,
  FALLBACK_DEFAULT_HOMEPAGE_PATH,
  ensureSystemHomepageCatalog,
  getDefaultHomepageSetting,
  updateDefaultHomepageSetting
}
export type { DefaultHomepageLandingPage, DefaultHomepageSetting }
