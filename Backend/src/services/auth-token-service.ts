import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authConfig } from '../lib/auth-config'
import { generateOneTimeCode, generateSecureToken, hashSecureToken } from '../lib/secure-token'
import type { SessionClientMeta } from './auth-service'

type IssuedOneTimeToken = {
  rawToken: string
  expiresAt: Date
}

type ActiveTokenRecord = {
  tokenId: string
  userId: string
}

const issueEmailVerificationToken = async (userId: string, clientMeta: SessionClientMeta): Promise<IssuedOneTimeToken> => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + authConfig.emailVerificationTokenTtlMs)

  // Keep only one active verification token per user.
  await prisma.emailVerificationToken.updateMany({
    where: {
      userId,
      consumedAt: null
    },
    data: {
      consumedAt: now
    }
  })

  let rawToken = ''

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nextRawToken = generateOneTimeCode(8)
    const tokenHash = hashSecureToken(nextRawToken)

    try {
      await prisma.emailVerificationToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
          requestedIp: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent
        }
      })

      rawToken = nextRawToken
      break
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error
      }

      rawToken = ''
    }
  }

  if (!rawToken) {
    throw new Error('Unable to generate email verification code.')
  }

  return {
    rawToken,
    expiresAt
  }
}

const issuePasswordResetToken = async (userId: string, clientMeta: SessionClientMeta): Promise<IssuedOneTimeToken> => {
  const rawToken = generateSecureToken()
  const tokenHash = hashSecureToken(rawToken)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + authConfig.passwordResetTokenTtlMs)

  // Keep only one active reset token per user.
  await prisma.passwordResetToken.updateMany({
    where: {
      userId,
      consumedAt: null
    },
    data: {
      consumedAt: now
    }
  })

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      requestedIp: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent
    }
  })

  return {
    rawToken,
    expiresAt
  }
}

const findActiveEmailVerificationToken = async (rawToken: string): Promise<ActiveTokenRecord | null> => {
  const tokenHash = hashSecureToken(rawToken)
  const now = new Date()

  const existingToken = await prisma.emailVerificationToken.findUnique({
    where: {
      tokenHash
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true
    }
  })

  if (!existingToken || existingToken.consumedAt || existingToken.expiresAt.getTime() <= now.getTime()) {
    return null
  }

  return {
    tokenId: existingToken.id,
    userId: existingToken.userId
  }
}

const findActivePasswordResetToken = async (rawToken: string): Promise<ActiveTokenRecord | null> => {
  const tokenHash = hashSecureToken(rawToken)
  const now = new Date()

  const existingToken = await prisma.passwordResetToken.findUnique({
    where: {
      tokenHash
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true
    }
  })

  if (!existingToken || existingToken.consumedAt || existingToken.expiresAt.getTime() <= now.getTime()) {
    return null
  }

  return {
    tokenId: existingToken.id,
    userId: existingToken.userId
  }
}

const consumeEmailVerificationTokenById = async (tokenId: string, consumedAt: Date) => {
  await prisma.emailVerificationToken.update({
    where: {
      id: tokenId
    },
    data: {
      consumedAt
    }
  })
}

const consumePasswordResetTokenById = async (tokenId: string, consumedAt: Date) => {
  await prisma.passwordResetToken.update({
    where: {
      id: tokenId
    },
    data: {
      consumedAt
    }
  })
}

const consumeAllEmailVerificationTokensForUser = async (userId: string, consumedAt: Date) => {
  await prisma.emailVerificationToken.updateMany({
    where: {
      userId,
      consumedAt: null
    },
    data: {
      consumedAt
    }
  })
}

const consumeAllPasswordResetTokensForUser = async (userId: string, consumedAt: Date) => {
  await prisma.passwordResetToken.updateMany({
    where: {
      userId,
      consumedAt: null
    },
    data: {
      consumedAt
    }
  })
}

export {
  consumeAllEmailVerificationTokensForUser,
  consumeAllPasswordResetTokensForUser,
  consumeEmailVerificationTokenById,
  consumePasswordResetTokenById,
  findActiveEmailVerificationToken,
  findActivePasswordResetToken,
  issueEmailVerificationToken,
  issuePasswordResetToken
}
