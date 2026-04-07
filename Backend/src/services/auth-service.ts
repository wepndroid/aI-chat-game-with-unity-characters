import type { UserRole } from '@prisma/client'
import type { Request } from 'express'
import { authConfig, getEffectiveUserRoleForTesting } from '../lib/auth-config'
import { prisma } from '../lib/prisma'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import { generateOpaqueSessionToken, hashOpaqueSessionToken } from '../lib/session-token'

type SessionClientMeta = {
  ipAddress: string | null
  userAgent: string | null
}

type AuthenticatedSessionUser = {
  userId: string
  email: string
  role: UserRole
  isEmailVerified: boolean
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
  const runtimeSettings = await getRuntimeAdminSettings().catch(() => null)
  const sessionTtlMs = runtimeSettings ? Math.max(10, runtimeSettings.sessionLogin.sessionTtlMinutes) * 60 * 1000 : authConfig.sessionTtlMs
  const expiresAt = new Date(now.getTime() + sessionTtlMs)

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

/**
 * Short-lived session for WebGL: parent page calls GET /auth/webgl-token with cookie auth;
 * Unity uses `Authorization: Bearer <token>` (same resolution path as cookie session).
 */
const createWebGlBridgeSessionForUser = async (userId: string, clientMeta: SessionClientMeta) => {
  const rawSessionToken = generateOpaqueSessionToken()
  const sessionTokenHash = hashOpaqueSessionToken(rawSessionToken)
  const now = new Date()
  const ttlMs = Math.max(60_000, authConfig.webglSessionTtlMs)
  const expiresAt = new Date(now.getTime() + ttlMs)

  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      ipAddress: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent ? `[webgl-bridge] ${clientMeta.userAgent}` : '[webgl-bridge]'
    }
  })

  return { rawSessionToken, expiresAt }
}

/** `banned` = session was valid but the user is banned (all sessions revoked). */
type ResolveSessionResult = AuthenticatedSessionUser | null | 'banned'

const resolveAuthenticatedSessionUser = async (rawSessionToken: string): Promise<ResolveSessionResult> => {
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
          role: true,
          isEmailVerified: true,
          isBanned: true
        }
      }
    }
  })

  if (!existingSession) {
    return null
  }

  if (existingSession.user.isBanned) {
    await revokeAllSessionsForUser(existingSession.userId, now)
    return 'banned'
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
    role: getEffectiveUserRoleForTesting(existingSession.user.role),
    isEmailVerified: existingSession.user.isEmailVerified,
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
  createWebGlBridgeSessionForUser,
  extractSessionClientMeta,
  revokeAllSessionsForUser,
  resolveAuthenticatedSessionUser,
  revokeOpaqueSessionByToken
}
export type { AuthenticatedSessionUser, ResolveSessionResult, SessionClientMeta }
