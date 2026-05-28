import type { Prisma, UserRole } from '@prisma/client'
import type { Request } from 'express'
import { authConfig, getEffectiveUserRoleForTesting } from '../lib/auth-config'
import { prisma } from '../lib/prisma'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import { generateOpaqueSessionToken, hashOpaqueSessionToken } from '../lib/session-token'
import {
  refreshSessionLastSeenIfStale,
  type SessionLastSeenRefreshWarningLogger
} from './auth/session-last-seen-policy'
import {
  recordUserActivityState,
  refreshUserActivityStateIfStale,
  type UserActivityStateWarningLogger
} from './auth/user-activity-state-service'

type SessionClientMeta = {
  ipAddress: string | null
  userAgent: string | null
}

type WebGlBridgeSessionPrismaClient = Pick<Prisma.TransactionClient, 'session' | 'userActivityState'>
type ResolveSessionPrismaClient = Pick<Prisma.TransactionClient, 'session' | 'userActivityState'>

type WebGlBridgeSessionDependencies = {
  prismaClient?: WebGlBridgeSessionPrismaClient
  tokenGenerator?: typeof generateOpaqueSessionToken
  tokenHasher?: typeof hashOpaqueSessionToken
  now?: () => Date
  ttlMs?: number
}

type ResolveAuthenticatedSessionUserDependencies = {
  prismaClient?: ResolveSessionPrismaClient
  tokenHasher?: typeof hashOpaqueSessionToken
  now?: () => Date
  lastSeenRefreshWarningLogger?: SessionLastSeenRefreshWarningLogger
  activityRefreshWarningLogger?: UserActivityStateWarningLogger
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

const createOpaqueSessionForUserWithExpiry = async (userId: string, clientMeta: SessionClientMeta) => {
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
  await recordUserActivityState({
    db: prisma,
    userId,
    lastSeenAt: now
  })

  return { rawSessionToken, expiresAt }
}

const createOpaqueSessionForUser = async (userId: string, clientMeta: SessionClientMeta) => {
  const session = await createOpaqueSessionForUserWithExpiry(userId, clientMeta)
  return session.rawSessionToken
}

/**
 * Short-lived session for WebGL: parent page calls GET /auth/webgl-token with cookie auth;
 * Unity uses `Authorization: Bearer <token>` (same resolution path as cookie session).
 */
const createWebGlBridgeSessionForUserWithClient = async (
  userId: string,
  clientMeta: SessionClientMeta,
  dependencies: WebGlBridgeSessionDependencies = {}
) => {
  const tokenGenerator = dependencies.tokenGenerator ?? generateOpaqueSessionToken
  const tokenHasher = dependencies.tokenHasher ?? hashOpaqueSessionToken
  const prismaClient = dependencies.prismaClient ?? prisma
  const now = dependencies.now ?? (() => new Date())
  const rawSessionToken = tokenGenerator()
  const sessionTokenHash = tokenHasher(rawSessionToken)
  const issuedAt = now()
  const ttlMs = Math.max(60_000, dependencies.ttlMs ?? authConfig.webglSessionTtlMs)
  const expiresAt = new Date(issuedAt.getTime() + ttlMs)

  await prismaClient.session.create({
    data: {
      userId,
      sessionTokenHash,
      expiresAt,
      createdAt: issuedAt,
      lastSeenAt: issuedAt,
      ipAddress: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent ? `[webgl-bridge] ${clientMeta.userAgent}` : '[webgl-bridge]'
    }
  })
  await recordUserActivityState({
    db: prismaClient,
    userId,
    lastSeenAt: issuedAt
  })

  return { rawSessionToken, expiresAt }
}

const createWebGlBridgeSessionForUser = async (userId: string, clientMeta: SessionClientMeta) =>
  createWebGlBridgeSessionForUserWithClient(userId, clientMeta)

/** `banned` = session was valid but the user is banned (all sessions revoked). */
type ResolveSessionResult = AuthenticatedSessionUser | null | 'banned'

const resolveAuthenticatedSessionUserWithClient = async (
  rawSessionToken: string,
  dependencies: ResolveAuthenticatedSessionUserDependencies = {}
): Promise<ResolveSessionResult> => {
  const tokenHasher = dependencies.tokenHasher ?? hashOpaqueSessionToken
  const prismaClient = dependencies.prismaClient ?? prisma
  const now = dependencies.now?.() ?? new Date()
  const sessionTokenHash = tokenHasher(rawSessionToken)

  const existingSession = await prismaClient.session.findFirst({
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
      lastSeenAt: true,
      user: {
        select: {
          email: true,
          role: true,
          isEmailVerified: true,
          isBanned: true,
          activityState: {
            select: {
              lastSeenAt: true
            }
          }
        }
      }
    }
  })

  if (!existingSession) {
    return null
  }

  if (existingSession.user.isBanned) {
    await revokeAllSessionsForUserWithClient(prismaClient, existingSession.userId, now)
    return 'banned'
  }

  await refreshSessionLastSeenIfStale({
    db: prismaClient,
    sessionId: existingSession.id,
    lastSeenAt: existingSession.lastSeenAt,
    now,
    warningLogger: dependencies.lastSeenRefreshWarningLogger
  })
  await refreshUserActivityStateIfStale({
    db: prismaClient,
    userId: existingSession.userId,
    lastSeenAt: existingSession.user.activityState?.lastSeenAt ?? null,
    now,
    warningLogger: dependencies.activityRefreshWarningLogger
  })

  return {
    userId: existingSession.userId,
    email: existingSession.user.email,
    role: getEffectiveUserRoleForTesting(existingSession.user.role),
    isEmailVerified: existingSession.user.isEmailVerified,
    sessionId: existingSession.id
  }
}

const resolveAuthenticatedSessionUser = async (rawSessionToken: string): Promise<ResolveSessionResult> =>
  resolveAuthenticatedSessionUserWithClient(rawSessionToken)

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

const revokeAllSessionsForUserWithClient = async (
  prismaClient: ResolveSessionPrismaClient,
  userId: string,
  revokedAt: Date
) => {
  await prismaClient.session.updateMany({
    where: {
      userId,
      revokedAt: null
    },
    data: {
      revokedAt
    }
  })
}

const revokeAllSessionsForUser = async (userId: string, revokedAt: Date) => {
  await revokeAllSessionsForUserWithClient(prisma, userId, revokedAt)
}

export {
  createOpaqueSessionForUser,
  createOpaqueSessionForUserWithExpiry,
  createWebGlBridgeSessionForUser,
  createWebGlBridgeSessionForUserWithClient,
  extractSessionClientMeta,
  revokeAllSessionsForUser,
  resolveAuthenticatedSessionUser,
  resolveAuthenticatedSessionUserWithClient,
  revokeOpaqueSessionByToken
}
export type {
  AuthenticatedSessionUser,
  ResolveAuthenticatedSessionUserDependencies,
  ResolveSessionResult,
  SessionClientMeta,
  WebGlBridgeSessionDependencies
}
