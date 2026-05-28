import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FALLBACK_DEFAULT_HOMEPAGE_KEY,
  FALLBACK_DEFAULT_HOMEPAGE_PATH,
  updateDefaultHomepageSetting
} from './default-homepage-service'

const NOW = new Date('2026-05-21T12:00:00.000Z')

type ExecuteRawCall = {
  query: string
  values: unknown[]
}

const DEFAULT_SETTING_ROW = {
  id: null,
  key: null,
  name: null,
  basePath: null,
  isActive: null
}

const CONCRETE_SETTING_ROW = {
  id: 'landing-1',
  key: 'home1',
  name: 'Homepage Variant 1',
  basePath: '/',
  isActive: 1
}

const installPrismaMocks = (input: {
  landingPage?: {
    id: string
    key: string
    name: string
    basePath: string | null
    isActive: boolean
  } | null
  settingRows?: Array<typeof DEFAULT_SETTING_ROW | typeof CONCRETE_SETTING_ROW>
}) => {
  const executeRawCalls: ExecuteRawCall[] = []
  const findUniqueQueries: unknown[] = []

  const db = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executeRawCalls.push({
        query: strings.join('?'),
        values
      })
      return 1
    },
    $queryRaw: async () => input.settingRows ?? [DEFAULT_SETTING_ROW],
    landingPage: {
      findUnique: async (query: unknown) => {
        findUniqueQueries.push(query)
        return input.landingPage ?? null
      }
    }
  }

  return {
    db,
    executeRawCalls,
    findUniqueQueries
  }
}

test('updateDefaultHomepageSetting clears the explicit landing page when the admin selects fallback', async () => {
  const { db, executeRawCalls, findUniqueQueries } = installPrismaMocks({
    settingRows: [DEFAULT_SETTING_ROW]
  })

  const result = await updateDefaultHomepageSetting(null, {
    db: db as never,
    now: NOW
  })

  assert.deepEqual(result, {
    landingPage: null,
    fallbackKey: FALLBACK_DEFAULT_HOMEPAGE_KEY,
    fallbackPath: FALLBACK_DEFAULT_HOMEPAGE_PATH
  })
  assert.equal(findUniqueQueries.length, 0)
  assert.equal(executeRawCalls.length, 1)
  assert.equal(executeRawCalls[0].values[0], 'default-homepage')
  assert.equal(executeRawCalls[0].values[1], null)
})

test('updateDefaultHomepageSetting keeps validating concrete landing page selections before writing', async () => {
  const { db, executeRawCalls, findUniqueQueries } = installPrismaMocks({
    landingPage: {
      id: 'landing-1',
      key: 'home1',
      name: 'Homepage Variant 1',
      basePath: '/',
      isActive: true
    },
    settingRows: [CONCRETE_SETTING_ROW]
  })

  const result = await updateDefaultHomepageSetting('landing-1', {
    db: db as never,
    now: NOW
  })

  assert.equal(result.landingPage?.id, 'landing-1')
  assert.equal(result.landingPage?.basePath, '/')
  assert.equal(findUniqueQueries.length, 1)
  assert.equal(executeRawCalls.length, 1)
  assert.equal(executeRawCalls[0].values[1], 'landing-1')
})

test('updateDefaultHomepageSetting rejects inactive or pathless landing pages before writing', async () => {
  for (const landingPage of [
    {
      id: 'inactive-landing',
      key: 'inactive',
      name: 'Inactive',
      basePath: '/inactive',
      isActive: false
    },
    {
      id: 'pathless-landing',
      key: 'pathless',
      name: 'Pathless',
      basePath: null,
      isActive: true
    }
  ]) {
    const { db, executeRawCalls } = installPrismaMocks({
      landingPage
    })

    await assert.rejects(
      updateDefaultHomepageSetting(landingPage.id, {
        db: db as never,
        now: NOW
      }),
      /Default homepage must be an active landing page with a base path\./
    )
    assert.equal(executeRawCalls.length, 0)
  }
})
