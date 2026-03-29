import { Prisma, type SocialProvider } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import type { OAuthProviderProfile } from './oauth-provider'

type ResolvedOAuthUser = {
  id: string
  email: string
  username: string
  role: 'USER' | 'CREATOR' | 'ADMIN'
  isEmailVerified: boolean
  isBanned: boolean
}

type OAuthAuthenticationIntent = 'signin' | 'signup'

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

const generateUniqueUsername = async (displayName: string | null, email: string) => {
  const initialBase = sanitizeUsernameBase(displayName || email.split('@')[0] || 'user')

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = buildUsernameCandidate(initialBase, attempt)
    const existingUser = await prisma.user.findUnique({
      where: {
        username: candidate
      },
      select: {
        id: true
      }
    })

    if (!existingUser) {
      return candidate
    }
  }

  return `user_${randomBytes(3).toString('hex')}`.slice(0, 30)
}

const findSafeUserFields = async (userId: string): Promise<ResolvedOAuthUser | null> => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isEmailVerified: true,
      isBanned: true
    }
  })

  return user
}

const resolveUserForOAuthAuthentication = async (params: {
  provider: SocialProvider
  profile: OAuthProviderProfile
  authenticatedUserId: string | null
  intent: OAuthAuthenticationIntent
}): Promise<ResolvedOAuthUser> => {
  const normalizedEmail = params.profile.email?.trim().toLowerCase() || null
  const emailIsVerifiedByProvider = params.profile.emailVerified

  if (params.authenticatedUserId) {
    const authenticatedUser = await findSafeUserFields(params.authenticatedUserId)

    if (!authenticatedUser) {
      throw new Error('Authenticated user was not found.')
    }

    const existingByProviderIdentity = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: params.provider,
          providerUserId: params.profile.providerUserId
        }
      },
      select: {
        userId: true
      }
    })

    if (existingByProviderIdentity && existingByProviderIdentity.userId !== authenticatedUser.id) {
      throw new Error('This OAuth account is already linked to a different user.')
    }

    const existingProviderLinkForUser = await prisma.oAuthAccount.findUnique({
      where: {
        userId_provider: {
          userId: authenticatedUser.id,
          provider: params.provider
        }
      },
      select: {
        providerUserId: true
      }
    })

    if (existingProviderLinkForUser && existingProviderLinkForUser.providerUserId !== params.profile.providerUserId) {
      throw new Error('A different OAuth account for this provider is already linked to this user.')
    }

    if (!existingProviderLinkForUser) {
      await prisma.oAuthAccount.create({
        data: {
          userId: authenticatedUser.id,
          provider: params.provider,
          providerUserId: params.profile.providerUserId
        }
      })
    }

    return authenticatedUser
  }

  const existingByProviderIdentity = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: params.provider,
        providerUserId: params.profile.providerUserId
      }
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isEmailVerified: true,
          isBanned: true
        }
      }
    }
  })

  if (existingByProviderIdentity?.user) {
    return existingByProviderIdentity.user
  }

  if (!normalizedEmail || !emailIsVerifiedByProvider) {
    throw new Error('OAuth provider did not return a verified e-mail address.')
  }

  const existingByEmail = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isEmailVerified: true,
      isBanned: true
    }
  })

  if (existingByEmail) {
    const existingProviderLinkForUser = await prisma.oAuthAccount.findUnique({
      where: {
        userId_provider: {
          userId: existingByEmail.id,
          provider: params.provider
        }
      },
      select: {
        providerUserId: true
      }
    })

    if (existingProviderLinkForUser && existingProviderLinkForUser.providerUserId !== params.profile.providerUserId) {
      throw new Error('A different OAuth account for this provider is already linked to this user.')
    }

    if (!existingProviderLinkForUser) {
      await prisma.oAuthAccount.create({
        data: {
          userId: existingByEmail.id,
          provider: params.provider,
          providerUserId: params.profile.providerUserId
        }
      })
    }

    // Trust verified e-mail from OAuth provider and align account flags.
    if (emailIsVerifiedByProvider && !existingByEmail.isEmailVerified) {
      const updatedUser = await prisma.user.update({
        where: {
          id: existingByEmail.id
        },
        data: {
          isEmailVerified: true
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isEmailVerified: true,
          isBanned: true
        }
      })

      return updatedUser
    }

    return existingByEmail
  }

  const nextUsername = await generateUniqueUsername(params.profile.displayName, normalizedEmail)

  try {
    const createdUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: nextUsername,
        role: 'USER',
        isEmailVerified: true
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isEmailVerified: true,
        isBanned: true
      }
    })

    await prisma.oAuthAccount.create({
      data: {
        userId: createdUser.id,
        provider: params.provider,
        providerUserId: params.profile.providerUserId
      }
    })

    return createdUser
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('Unable to link OAuth account due to a duplicate identity conflict.')
    }

    throw error
  }
}

export { resolveUserForOAuthAuthentication }
export type { OAuthAuthenticationIntent, ResolvedOAuthUser }
