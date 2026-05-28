import type { SocialProvider } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import {
  OAuthAccountConflictError,
  type OAuthAccountConflictContext,
  type OAuthAccountConflictReason
} from './oauth-account-errors'
import type { OAuthProviderProfile } from './oauth-provider'

type ResolvedOAuthUser = {
  id: string
  email: string
  username: string
  role: 'USER' | 'CREATOR' | 'ADMIN'
  isEmailVerified: boolean
  isBanned: boolean
  hasPassword: boolean
  isNewlyCreated: boolean
}

type OAuthAuthenticationIntent = 'signin' | 'signup'

type OAuthAccountUserRow = {
  id: string
  email: string
  username: string
  role: 'USER' | 'CREATOR' | 'ADMIN'
  isEmailVerified: boolean
  isBanned: boolean
  passwordHash: string | null
}

type OAuthAccountCreateUserInput = {
  email: string
  username: string
}

type OAuthProviderIdentityInput = {
  provider: SocialProvider
  providerUserId: string
}

type OAuthProviderLinkForUserInput = {
  userId: string
  provider: SocialProvider
}

type OAuthAccountLinkInput = OAuthProviderIdentityInput & {
  userId: string
}

/**
 * Narrow domain port for OAuth account resolution.
 *
 * Keeping Prisma behind semantic operations makes the account-linking product
 * rules testable without depending on Prisma's generated call shapes, while
 * still leaving all persistence ownership inside this service.
 */
type OAuthAccountDatabase = {
  findUserById: (userId: string) => Promise<OAuthAccountUserRow | null>
  findUserByEmail: (email: string) => Promise<OAuthAccountUserRow | null>
  findUserIdByUsername: (username: string) => Promise<string | null>
  findUserIdByProviderIdentity: (input: OAuthProviderIdentityInput) => Promise<string | null>
  findUserByProviderIdentity: (input: OAuthProviderIdentityInput) => Promise<OAuthAccountUserRow | null>
  findProviderUserIdForUser: (input: OAuthProviderLinkForUserInput) => Promise<string | null>
  createOAuthAccount: (input: OAuthAccountLinkInput) => Promise<void>
  createUserFromOAuth: (input: OAuthAccountCreateUserInput) => Promise<OAuthAccountUserRow>
  markUserEmailVerified: (userId: string) => Promise<OAuthAccountUserRow>
}

type ResolveUserForOAuthAuthenticationParams = {
  provider: SocialProvider
  profile: OAuthProviderProfile
  authenticatedUserId: string | null
  intent: OAuthAuthenticationIntent
  db?: OAuthAccountDatabase
}

const oauthUserSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  isEmailVerified: true,
  isBanned: true,
  passwordHash: true
} as const

const prismaOAuthAccountDatabase: OAuthAccountDatabase = {
  findUserById: async (userId) => prisma.user.findUnique({
    where: {
      id: userId
    },
    select: oauthUserSelect
  }),
  findUserByEmail: async (email) => prisma.user.findUnique({
    where: {
      email
    },
    select: oauthUserSelect
  }),
  findUserIdByUsername: async (username) => {
    const existingUser = await prisma.user.findUnique({
      where: {
        username
      },
      select: {
        id: true
      }
    })

    return existingUser?.id ?? null
  },
  findUserIdByProviderIdentity: async (input) => {
    const existingAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: input.provider,
          providerUserId: input.providerUserId
        }
      },
      select: {
        userId: true
      }
    })

    return existingAccount?.userId ?? null
  },
  findUserByProviderIdentity: async (input) => {
    const existingAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: input.provider,
          providerUserId: input.providerUserId
        }
      },
      select: {
        user: {
          select: oauthUserSelect
        }
      }
    })

    return existingAccount?.user ?? null
  },
  findProviderUserIdForUser: async (input) => {
    const existingAccount = await prisma.oAuthAccount.findUnique({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: input.provider
        }
      },
      select: {
        providerUserId: true
      }
    })

    return existingAccount?.providerUserId ?? null
  },
  createOAuthAccount: async (input) => {
    await prisma.oAuthAccount.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        providerUserId: input.providerUserId
      }
    })
  },
  createUserFromOAuth: async (input) => prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      role: 'USER',
      isEmailVerified: true
    },
    select: oauthUserSelect
  }),
  markUserEmailVerified: async (userId) => prisma.user.update({
    where: {
      id: userId
    },
    data: {
      isEmailVerified: true
    },
    select: oauthUserSelect
  })
}

const sanitizeUsernameBase = (inputValue: string) => {
  const normalized = inputValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')

  const fallback = normalized || 'user'
  const truncated = fallback.slice(0, 24)

  if (truncated.length >= 3) {
    return truncated
  }

  return `${truncated.padEnd(3, 'x')}`.slice(0, 24)
}

const buildUsernameCandidate = (baseValue: string, suffix: number) => {
  if (suffix === 0) {
    return baseValue
  }

  const suffixText = `${suffix}`
  const maxBaseLength = 30 - suffixText.length
  const trimmedBase = baseValue.slice(0, Math.max(3, maxBaseLength))
  return `${trimmedBase}${suffixText}`.slice(0, 30)
}

const generateUniqueUsername = async (displayName: string | null, email: string, db: OAuthAccountDatabase) => {
  const initialBase = sanitizeUsernameBase(displayName || email.split('@')[0] || 'user')

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = buildUsernameCandidate(initialBase, attempt)
    const existingUserId = await db.findUserIdByUsername(candidate)

    if (!existingUserId) {
      return candidate
    }
  }

  return `user_${randomBytes(3).toString('hex')}`.slice(0, 30)
}

const toResolvedOAuthUser = (user: OAuthAccountUserRow, isNewlyCreated: boolean): ResolvedOAuthUser => ({
  id: user.id,
  email: user.email,
  username: user.username,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  isBanned: user.isBanned,
  hasPassword: Boolean(user.passwordHash),
  isNewlyCreated
})

const findSafeUserFields = async (userId: string, db: OAuthAccountDatabase): Promise<ResolvedOAuthUser | null> => {
  const user = await db.findUserById(userId)
  return user ? toResolvedOAuthUser(user, false) : null
}

const isUniqueConstraintError = (error: unknown) => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

const throwOAuthAccountConflict = (
  provider: SocialProvider,
  reason: OAuthAccountConflictReason,
  context: OAuthAccountConflictContext
): never => {
  throw new OAuthAccountConflictError({
    provider,
    reason,
    context
  })
}

const createOAuthAccountOrThrowConflict = async (
  db: OAuthAccountDatabase,
  input: OAuthAccountLinkInput,
  context: OAuthAccountConflictContext
) => {
  try {
    await db.createOAuthAccount(input)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throwOAuthAccountConflict(input.provider, 'duplicate_provider_identity_race', context)
    }

    throw error
  }
}

const resolveUserForOAuthAuthentication = async (params: ResolveUserForOAuthAuthenticationParams): Promise<ResolvedOAuthUser> => {
  const db = params.db ?? prismaOAuthAccountDatabase
  const normalizedEmail = params.profile.email?.trim().toLowerCase() || null
  const emailIsVerifiedByProvider = params.profile.emailVerified

  if (params.authenticatedUserId) {
    const authenticatedUser = await findSafeUserFields(params.authenticatedUserId, db)

    if (!authenticatedUser) {
      throw new Error('Authenticated user was not found.')
    }

    const existingProviderIdentityUserId = await db.findUserIdByProviderIdentity({
      provider: params.provider,
      providerUserId: params.profile.providerUserId
    })

    if (existingProviderIdentityUserId && existingProviderIdentityUserId !== authenticatedUser.id) {
      throwOAuthAccountConflict(params.provider, 'provider_identity_belongs_to_other_user', 'authenticated_link')
    }

    const existingProviderUserIdForUser = await db.findProviderUserIdForUser({
      userId: authenticatedUser.id,
      provider: params.provider
    })

    if (existingProviderUserIdForUser && existingProviderUserIdForUser !== params.profile.providerUserId) {
      throwOAuthAccountConflict(params.provider, 'user_already_has_different_provider_identity', 'authenticated_link')
    }

    if (!existingProviderUserIdForUser) {
      await createOAuthAccountOrThrowConflict(db, {
        userId: authenticatedUser.id,
        provider: params.provider,
        providerUserId: params.profile.providerUserId
      }, 'authenticated_link')
    }

    return {
      ...authenticatedUser,
      isNewlyCreated: false
    }
  }

  const existingByProviderIdentity = await db.findUserByProviderIdentity({
    provider: params.provider,
    providerUserId: params.profile.providerUserId
  })

  if (existingByProviderIdentity) {
    return toResolvedOAuthUser(existingByProviderIdentity, false)
  }

  if (!normalizedEmail || !emailIsVerifiedByProvider) {
    throw new Error('OAuth provider did not return a verified e-mail address.')
  }

  const existingByEmail = await db.findUserByEmail(normalizedEmail)

  if (existingByEmail) {
    const existingProviderUserIdForUser = await db.findProviderUserIdForUser({
      userId: existingByEmail.id,
      provider: params.provider
    })

    if (existingProviderUserIdForUser && existingProviderUserIdForUser !== params.profile.providerUserId) {
      throwOAuthAccountConflict(params.provider, 'user_already_has_different_provider_identity', 'email_matched_signin')
    }

    if (!existingProviderUserIdForUser) {
      await createOAuthAccountOrThrowConflict(db, {
        userId: existingByEmail.id,
        provider: params.provider,
        providerUserId: params.profile.providerUserId
      }, 'email_matched_signin')
    }

    // Trust verified e-mail from OAuth provider and align account flags.
    if (emailIsVerifiedByProvider && !existingByEmail.isEmailVerified) {
      return toResolvedOAuthUser(await db.markUserEmailVerified(existingByEmail.id), false)
    }

    return toResolvedOAuthUser(existingByEmail, false)
  }

  const nextUsername = await generateUniqueUsername(params.profile.displayName, normalizedEmail, db)
  const createdUser = await db.createUserFromOAuth({
    email: normalizedEmail,
    username: nextUsername
  })

  await createOAuthAccountOrThrowConflict(db, {
    userId: createdUser.id,
    provider: params.provider,
    providerUserId: params.profile.providerUserId
  }, 'new_account_race')

  return toResolvedOAuthUser(createdUser, true)
}

export { resolveUserForOAuthAuthentication }
export type {
  OAuthAccountDatabase,
  OAuthAccountUserRow,
  OAuthAuthenticationIntent,
  ResolvedOAuthUser
}
