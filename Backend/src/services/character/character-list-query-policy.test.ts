import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import {
  buildCharacterListWhereClause,
  buildPopularCharacterListWhereSql
} from './character-list-query-policy'
import type { CharacterAccessActor } from './character-access-policy'

const signedInUser: Exclude<CharacterAccessActor, null> = {
  userId: 'user-1',
  role: 'USER',
  isEmailVerified: true
}

const adminUser: Exclude<CharacterAccessActor, null> = {
  userId: 'admin-1',
  role: 'ADMIN',
  isEmailVerified: true
}

const inspectSql = (fragment: Prisma.Sql) => ({
  sql: fragment.sql.replace(/\s+/g, ' ').trim(),
  values: [...fragment.values]
})

test('popular SQL keeps anonymous all-gallery lists public and approved', () => {
  assert.deepEqual(buildCharacterListWhereClause(null, { galleryScope: 'all' }), {
    status: 'APPROVED',
    visibility: 'PUBLIC'
  })

  const { sql, values } = inspectSql(buildPopularCharacterListWhereSql(null, { galleryScope: 'all' }))

  assert.match(sql, /c\."status" = \?::"CharacterStatus"/)
  assert.match(sql, /c\."visibility" = \?::"CharacterVisibility"/)
  assert.deepEqual(values, ['APPROVED', 'PUBLIC'])
})

test('popular SQL casts PostgreSQL enum parameters for status visibility and owner role', () => {
  const { sql, values } = inspectSql(buildPopularCharacterListWhereSql(adminUser, { galleryScope: 'community', adminCommunityAll: true }))

  assert.match(sql, /owner\."role" != \?::"UserRole"/)
  assert.match(sql, /c\."status" != \?::"CharacterStatus"/)
  assert.deepEqual(values, ['ADMIN', 'REJECTED'])
})

test('popular SQL keeps signed-in all-gallery lists approved and visible to catalog users', () => {
  assert.deepEqual(buildCharacterListWhereClause(signedInUser, { galleryScope: 'all' }), {
    status: 'APPROVED',
    visibility: {
      in: ['PUBLIC', 'UNLISTED']
    }
  })

  const { sql, values } = inspectSql(buildPopularCharacterListWhereSql(signedInUser, { galleryScope: 'all' }))

  assert.match(sql, /c\."status" = \?/)
  assert.match(sql, /c\."visibility" IN \(\?::"CharacterVisibility",\?::"CharacterVisibility"\)/)
  assert.deepEqual(values, ['APPROVED', 'PUBLIC', 'UNLISTED'])
})

test('popular SQL keeps anonymous curated and community galleries public-only', () => {
  const curated = inspectSql(buildPopularCharacterListWhereSql(null, { galleryScope: 'curated' }))
  const community = inspectSql(buildPopularCharacterListWhereSql(null, { galleryScope: 'community' }))

  assert.match(curated.sql, /owner\."role" = \?/)
  assert.match(curated.sql, /c\."visibility" = \?/)
  assert.deepEqual(curated.values, ['APPROVED', 'PUBLIC', 'ADMIN'])

  assert.match(community.sql, /owner\."role" != \?/)
  assert.match(community.sql, /c\."visibility" = \?/)
  assert.deepEqual(community.values, ['APPROVED', 'PUBLIC', 'ADMIN'])
})

test('popular SQL keeps explicit signed-in catalog status constrained by catalog visibility', () => {
  const { sql, values } = inspectSql(
    buildPopularCharacterListWhereSql(signedInUser, {
      galleryScope: 'all',
      status: 'PENDING'
    })
  )

  assert.match(sql, /c\."status" = \?/)
  assert.match(sql, /c\."visibility" IN \(\?::"CharacterVisibility",\?::"CharacterVisibility"\)/)
  assert.deepEqual(values, ['PENDING', 'PUBLIC', 'UNLISTED'])
})

test('popular SQL keeps signed-in mine lists owner scoped instead of catalog scoped', () => {
  const { sql, values } = inspectSql(buildPopularCharacterListWhereSql(signedInUser, { galleryScope: 'mine' }))

  assert.match(sql, /c\."ownerId" = \?/)
  assert.doesNotMatch(sql, /c\."visibility"/)
  assert.deepEqual(values, ['user-1'])
})

test('popular SQL keeps admin curated catalog mode constrained by visibility', () => {
  const { sql, values } = inspectSql(buildPopularCharacterListWhereSql(adminUser, { galleryScope: 'curated' }))

  assert.match(sql, /owner\."role" = \?/)
  assert.match(sql, /c\."status" = \?/)
  assert.match(sql, /c\."visibility" IN \(\?::"CharacterVisibility",\?::"CharacterVisibility"\)/)
  assert.deepEqual(values, ['ADMIN', 'APPROVED', 'PUBLIC', 'UNLISTED'])
})

test('popular SQL keeps admin curated management mode broad', () => {
  const { sql, values } = inspectSql(
    buildPopularCharacterListWhereSql(adminUser, {
      galleryScope: 'curated',
      adminCuratedAll: true
    })
  )

  assert.match(sql, /owner\."role" = \?/)
  assert.doesNotMatch(sql, /c\."visibility"/)
  assert.deepEqual(values, ['ADMIN'])
})

test('popular SQL keeps admin community management mode broad except rejected rows', () => {
  const { sql, values } = inspectSql(
    buildPopularCharacterListWhereSql(adminUser, {
      galleryScope: 'community',
      adminCommunityAll: true
    })
  )

  assert.match(sql, /owner\."role" != \?/)
  assert.match(sql, /c\."status" != \?/)
  assert.doesNotMatch(sql, /c\."visibility"/)
  assert.deepEqual(values, ['ADMIN', 'REJECTED'])
})

test('popular SQL keeps explicit owner lists owner scoped instead of catalog scoped', () => {
  const { sql, values } = inspectSql(buildPopularCharacterListWhereSql(adminUser, { listOwnerId: 'owner-1' }))

  assert.match(sql, /c\."ownerId" = \?/)
  assert.doesNotMatch(sql, /c\."visibility"/)
  assert.deepEqual(values, ['owner-1'])
})
