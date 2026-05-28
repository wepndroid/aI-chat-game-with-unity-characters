import assert from 'node:assert/strict'
import test from 'node:test'
import type { SocialProvider } from '@prisma/client'

import {
  isOAuthAccountConflictError,
  type OAuthAccountConflictContext,
  type OAuthAccountConflictReason
} from './oauth-account-errors'
import {
  resolveUserForOAuthAuthentication,
  type OAuthAccountDatabase,
  type OAuthAccountUserRow
} from './oauth-account-service'

const BASE_USER: OAuthAccountUserRow = {
  id: 'user-authenticated',
  email: 'owner@example.test',
  username: 'owner',
  role: 'USER',
  isEmailVerified: true,
  isBanned: false,
  passwordHash: 'hashed-password'
}

const createProfile = (providerUserId = 'provider-user-new') => ({
  providerUserId,
  email: 'owner@example.test',
  emailVerified: true,
  displayName: 'Owner',
  avatarUrl: null
})

const createOAuthAccountDb = (overrides: Partial<OAuthAccountDatabase> = {}): OAuthAccountDatabase => ({
  findUserById: async (userId) => (userId === BASE_USER.id ? BASE_USER : null),
  findUserByEmail: async (email) => (email === BASE_USER.email ? BASE_USER : null),
  findUserIdByUsername: async () => null,
  findUserIdByProviderIdentity: async () => null,
  findUserByProviderIdentity: async () => null,
  findProviderUserIdForUser: async () => null,
  createOAuthAccount: async () => undefined,
  createUserFromOAuth: async (input) => ({
    ...BASE_USER,
    id: 'user-created',
    email: input.email,
    username: input.username,
    passwordHash: null
  }),
  markUserEmailVerified: async (userId) => ({
    ...BASE_USER,
    id: userId,
    isEmailVerified: true
  }),
  ...overrides
})

const assertOAuthConflict = async (
  action: () => Promise<unknown>,
  expected: {
    provider: SocialProvider
    reason: OAuthAccountConflictReason
    context: OAuthAccountConflictContext
  }
) => {
  await assert.rejects(action, (error: unknown) => {
    assert.equal(isOAuthAccountConflictError(error), true)

    if (!isOAuthAccountConflictError(error)) {
      return false
    }

    assert.equal(error.code, 'OAUTH_ACCOUNT_CONFLICT')
    assert.equal(error.provider, expected.provider)
    assert.equal(error.reason, expected.reason)
    assert.equal(error.context, expected.context)
    return true
  })
}

test('resolveUserForOAuthAuthentication throws typed conflict when the provider identity belongs to another user', async () => {
  const db = createOAuthAccountDb({
    findUserIdByProviderIdentity: async () => 'user-other'
  })

  await assertOAuthConflict(
    () =>
      resolveUserForOAuthAuthentication({
        provider: 'GOOGLE',
        profile: createProfile(),
        authenticatedUserId: BASE_USER.id,
        intent: 'signin',
        db
      }),
    {
      provider: 'GOOGLE',
      reason: 'provider_identity_belongs_to_other_user',
      context: 'authenticated_link'
    }
  )
})

test('resolveUserForOAuthAuthentication throws typed conflict when an authenticated user already has another identity for the provider', async () => {
  const db = createOAuthAccountDb({
    findProviderUserIdForUser: async () => 'provider-user-existing'
  })

  await assertOAuthConflict(
    () =>
      resolveUserForOAuthAuthentication({
        provider: 'GOOGLE',
        profile: createProfile(),
        authenticatedUserId: BASE_USER.id,
        intent: 'signin',
        db
      }),
    {
      provider: 'GOOGLE',
      reason: 'user_already_has_different_provider_identity',
      context: 'authenticated_link'
    }
  )
})

test('resolveUserForOAuthAuthentication keeps unauthenticated e-mail matched conflicts typed without leaking account existence in the policy layer', async () => {
  const db = createOAuthAccountDb({
    findProviderUserIdForUser: async () => 'provider-user-existing'
  })

  await assertOAuthConflict(
    () =>
      resolveUserForOAuthAuthentication({
        provider: 'GOOGLE',
        profile: createProfile(),
        authenticatedUserId: null,
        intent: 'signin',
        db
      }),
    {
      provider: 'GOOGLE',
      reason: 'user_already_has_different_provider_identity',
      context: 'email_matched_signin'
    }
  )
})

test('resolveUserForOAuthAuthentication converts OAuth account unique races into typed conflicts', async () => {
  const db = createOAuthAccountDb({
    createOAuthAccount: async () => {
      throw {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        meta: {
          target: ['provider', 'providerUserId']
        }
      }
    }
  })

  await assertOAuthConflict(
    () =>
      resolveUserForOAuthAuthentication({
        provider: 'GOOGLE',
        profile: createProfile(),
        authenticatedUserId: BASE_USER.id,
        intent: 'signin',
        db
      }),
    {
      provider: 'GOOGLE',
      reason: 'duplicate_provider_identity_race',
      context: 'authenticated_link'
    }
  )
})
