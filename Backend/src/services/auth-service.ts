import type { UserRole } from '@prisma/client'
import type { Request } from 'express'
import { authConfig } from '../lib/auth-config'
import { prisma } from '../lib/prisma'
import { generateOpaqueSessionToken, hashOpaqueSessionToken } from '../lib/session-token'

type SessionClientMeta = {
  ipAddress: string | null
  userAgent: string | null
}

type AuthenticatedSessionUser = {
  userId: string
  email: string
  role: UserRole
  sessionId: string
}

const getClientIp = (forwardedForHeaderValue: string | undefined, requestIp: string | undefined) => {
  const forwardedIp = forwardedForHeaderValue?.split(',')[0]?.trim()
  return forwardedIp || requestIp || null
}

const extractSessionClientMeta = (request: Request): SessionClientMeta => {
  return {
    ipAddress: getClientIp(request.header('x-forwarded-for'), request.ip),
    userAgent: request.header('user-agent') || null
  }
}

const createOpaqueSessionForUser = async (userId: string, clientMeta: SessionClientMeta) => {
  const rawSessionToken = generateOpaqueSessionToken()
  const sessionTokenHash = hashOpaqueSessionToken(rawSessionToken)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + authConfig.sessionTtlMs)

  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      ipAddress: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent
    }
  })

  return rawSessionToken
}

const resolveAuthenticatedSessionUser = async (rawSessionToken: string): Promise<AuthenticatedSessionUser | null> => {
  const sessionTokenHash = hashOpaqueSessionToken(rawSessionToken)
  const now = new Date()

  const existingSession = await prisma.session.findFirst({
    where: {
      sessionTokenHash,
      revokedAt: null,
      expiresAt: {
        gt: now
      }
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          email: true,
          role: true
        }
      }
    }
  })

  if (!existingSession) {
    return null
  }

  await prisma.session.update({
    where: {
      id: existingSession.id
    },
    data: {
      lastSeenAt: now
    }
  })

  return {
    userId: existingSession.userId,
    email: existingSession.user.email,
    role: existingSession.user.role,
    sessionId: existingSession.id
  }
}

const revokeOpaqueSessionByToken = async (rawSessionToken: string) => {
  const sessionTokenHash = hashOpaqueSessionToken(rawSessionToken)

  await prisma.session.updateMany({
    where: {
      sessionTokenHash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  })
}

const revokeAllSessionsForUser = async (userId: string, revokedAt: Date) => {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null
    },
    data: {
      revokedAt
    }
  })
}

export {
  createOpaqueSessionForUser,
  extractSessionClientMeta,
  revokeAllSessionsForUser,
  resolveAuthenticatedSessionUser,
  revokeOpaqueSessionByToken
}
export type { AuthenticatedSessionUser, SessionClientMeta }
