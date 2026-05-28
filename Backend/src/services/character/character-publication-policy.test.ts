import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveCharacterCreatePublication,
  resolveCharacterUpdatePublication
} from './character-publication-policy'

const now = new Date('2026-05-21T10:00:00.000Z')
const alreadyPublishedAt = new Date('2026-05-20T10:00:00.000Z')

test('resolveCharacterCreatePublication keeps admin draft creates unpublished', () => {
  const result = resolveCharacterCreatePublication({
    actorRole: 'ADMIN',
    visibility: 'PUBLIC',
    publicationIntent: 'draft',
    now
  })

  assert.deepEqual(result, {
    ok: true,
    status: 'DRAFT',
    publishedAt: null,
    requiresDefaultStory: false
  })
})

test('resolveCharacterCreatePublication publishes admin creates only on explicit publish intent', () => {
  const result = resolveCharacterCreatePublication({
    actorRole: 'ADMIN',
    visibility: 'PUBLIC',
    publicationIntent: 'publish',
    now
  })

  assert.deepEqual(result, {
    ok: true,
    status: 'APPROVED',
    publishedAt: now,
    requiresDefaultStory: true
  })
})

test('resolveCharacterCreatePublication rejects admin creates without explicit publication intent', () => {
  const result = resolveCharacterCreatePublication({
    actorRole: 'ADMIN',
    visibility: 'PUBLIC',
    now
  })

  assert.deepEqual(result, {
    ok: false,
    statusCode: 400,
    code: 'ADMIN_PUBLICATION_INTENT_REQUIRED',
    message: 'Admin official character creates require publicationIntent.'
  })
})

test('resolveCharacterCreatePublication rejects publication intent from non-admin creators', () => {
  const result = resolveCharacterCreatePublication({
    actorRole: 'USER',
    visibility: 'PUBLIC',
    publicationIntent: 'draft',
    now
  })

  assert.deepEqual(result, {
    ok: false,
    statusCode: 403,
    code: 'PUBLICATION_INTENT_FORBIDDEN',
    message: 'Only admins can set character publication intent.'
  })
})

test('resolveCharacterCreatePublication treats creator accounts as non-admin creators', () => {
  assert.deepEqual(resolveCharacterCreatePublication({ actorRole: 'CREATOR', visibility: 'PRIVATE', now }), {
    ok: true,
    status: 'APPROVED',
    publishedAt: now,
    requiresDefaultStory: true
  })

  assert.deepEqual(
    resolveCharacterCreatePublication({
      actorRole: 'CREATOR',
      visibility: 'PUBLIC',
      publicationIntent: 'publish',
      now
    }),
    {
      ok: false,
      statusCode: 403,
      code: 'PUBLICATION_INTENT_FORBIDDEN',
      message: 'Only admins can set character publication intent.'
    }
  )
})

test('resolveCharacterCreatePublication preserves non-admin private and shared submission behavior', () => {
  assert.deepEqual(resolveCharacterCreatePublication({ actorRole: 'USER', visibility: 'PRIVATE', now }), {
    ok: true,
    status: 'APPROVED',
    publishedAt: now,
    requiresDefaultStory: true
  })

  assert.deepEqual(resolveCharacterCreatePublication({ actorRole: 'USER', visibility: 'PUBLIC', now }), {
    ok: true,
    status: 'PENDING',
    publishedAt: null,
    requiresDefaultStory: false
  })

  assert.deepEqual(resolveCharacterCreatePublication({ actorRole: 'USER', visibility: 'UNLISTED', now }), {
    ok: true,
    status: 'PENDING',
    publishedAt: null,
    requiresDefaultStory: false
  })
})

test('resolveCharacterUpdatePublication drafts and publishes admin-owned official characters', () => {
  assert.deepEqual(
    resolveCharacterUpdatePublication({
      actorRole: 'ADMIN',
      characterOwnerRole: 'ADMIN',
      existingPublishedAt: alreadyPublishedAt,
      publicationIntent: 'draft',
      now
    }),
    {
      ok: true,
      status: 'DRAFT',
      publishedAt: null,
      clearsModerationRejectReason: true,
      requiresDefaultStory: false
    }
  )

  assert.deepEqual(
    resolveCharacterUpdatePublication({
      actorRole: 'ADMIN',
      characterOwnerRole: 'ADMIN',
      existingPublishedAt: alreadyPublishedAt,
      publicationIntent: 'publish',
      now
    }),
    {
      ok: true,
      status: 'APPROVED',
      publishedAt: alreadyPublishedAt,
      clearsModerationRejectReason: true,
      requiresDefaultStory: true
    }
  )
})

test('resolveCharacterUpdatePublication assigns first publish timestamp when publishing a draft', () => {
  const result = resolveCharacterUpdatePublication({
    actorRole: 'ADMIN',
    characterOwnerRole: 'ADMIN',
    existingPublishedAt: null,
    publicationIntent: 'publish',
    now
  })

  assert.deepEqual(result, {
    ok: true,
    status: 'APPROVED',
    publishedAt: now,
    clearsModerationRejectReason: true,
    requiresDefaultStory: true
  })
})

test('resolveCharacterUpdatePublication keeps content-only saves status-neutral', () => {
  const result = resolveCharacterUpdatePublication({
    actorRole: 'ADMIN',
    characterOwnerRole: 'ADMIN',
    existingPublishedAt: alreadyPublishedAt,
    now
  })

  assert.deepEqual(result, {
    ok: true,
    status: undefined,
    publishedAt: undefined,
    clearsModerationRejectReason: false,
    requiresDefaultStory: false
  })
})

test('resolveCharacterUpdatePublication rejects publication intent for community and non-admin edits', () => {
  assert.deepEqual(
    resolveCharacterUpdatePublication({
      actorRole: 'ADMIN',
      characterOwnerRole: 'USER',
      existingPublishedAt: null,
      publicationIntent: 'publish',
      now
    }),
    {
      ok: false,
      statusCode: 403,
      code: 'COMMUNITY_PUBLICATION_INTENT_FORBIDDEN',
      message: 'Community character moderation must use the moderation status endpoint.'
    }
  )

  assert.deepEqual(
    resolveCharacterUpdatePublication({
      actorRole: 'USER',
      characterOwnerRole: 'USER',
      existingPublishedAt: null,
      publicationIntent: 'publish',
      now
    }),
    {
      ok: false,
      statusCode: 403,
      code: 'PUBLICATION_INTENT_FORBIDDEN',
      message: 'Only admins can set character publication intent.'
    }
  )
})
