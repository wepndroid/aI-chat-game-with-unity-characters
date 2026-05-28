import { Prisma, type SocialProvider } from '@prisma/client'
import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { clearAuthCookie, setAuthCookie } from '../lib/auth-cookie'
import { sendApiData, sendApiError } from '../lib/api-contract'
import { authConfig, getEffectiveUserRoleForTesting } from '../lib/auth-config'
import { oauthConfig } from '../lib/oauth-config'
import { recordRuntimeLogEntry } from '../lib/runtime-log-buffer'
import { getLatestLandingAttributionForRequest } from '../services/landing/landing-page-attribution-service'
import { claimLandingAcquisitionForUser } from '../services/landing/landing-acquisition-claim-service'
import { hashPassword, verifyPassword } from '../lib/password-hash'
import { optionalAuth, requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import { requireGameAccess } from '../middleware/game-access-middleware'
import { prisma } from '../lib/prisma'
import { getUnreadNotificationCount } from '../lib/user-notification-count'
import {
  findActiveEmailVerificationToken,
  findActivePasswordResetToken,
  issueEmailVerificationToken,
  issuePasswordResetToken
} from '../services/auth-token-service'
import {
  createOpaqueSessionForUser,
  createOpaqueSessionForUserWithExpiry,
  createWebGlBridgeSessionForUser,
  extractSessionClientMeta,
  revokeOpaqueSessionByToken
} from '../services/auth-service'
import { emailService } from '../services/email-service'
import {
  issueWebglLaunchContext,
  resolveWebglLaunchContext,
  type WebglLaunchResolveError
} from '../services/auth/webgl-launch-context-service'
import {
  mapStorySessionContextErrorToApiCode,
  type StorySessionContextError
} from '../services/chat/story-session-context-service'
import { isGameAccessAllowed, sendMembershipRequiredError } from '../lib/game-access'
import { resolveUserForOAuthAuthentication } from '../services/oauth/oauth-account-service'
import { buildOAuthCallbackExpectedErrorRedirect } from '../services/oauth/oauth-callback-error-policy'
import { getOAuthProviderClient, isOAuthProviderKey } from '../services/oauth/oauth-provider-registry'
import { consumeOAuthState, issueOAuthState } from '../services/oauth/oauth-state-service'
import { resolveEffectiveMembershipTierForUser, resolveUserBillingTierCents } from '../services/membership/membership-tier-service'

const authRoutes = Router()

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128)
}).strict()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
}).strict()

const resolvePlayerName = (playerName: string | null | undefined, username: string) => {
  const normalized = playerName?.trim()
  return normalized && normalized.length > 0 ? normalized : username
}

const webglLaunchContextIssueSchema = z
  .object({
    story_id: z.string().trim().min(1),
    launch_mode: z.literal('fresh_session')
  })
  .strict()

const webglLaunchContextResolveSchema = z
  .object({
    launch_token: z.string().trim().min(20).max(500)
  })
  .strict()

const resendVerificationSchema = z.object({
  email: z.string().email().optional()
}).strict()

const verifyEmailCodeSchema = z.object({
  code: z.string().trim().min(6).max(32)
}).strict()

const forgotPasswordSchema = z.object({
  email: z.string().email()
}).strict()

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(500),
  password: z.string().min(8).max(128)
}).strict()

const setPasswordSchema = z.object({
  password: z.string().min(8).max(128)
}).strict()

const oauthStartQuerySchema = z.object({
  redirectAfter: z.string().trim().optional(),
  intent: z.enum(['signin', 'signup']).optional()
})

const oauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
})

const oauthProviderToSocialProviderMap: Record<'google', SocialProvider> = {
  google: 'GOOGLE'
}

const setNoStoreCacheControl = (_request: Request, response: Response, next: NextFunction) => {
  response.setHeader('Cache-Control', 'no-store')
  next()
}

const setWebglLaunchResolveNoStoreCacheControl = (request: Request, response: Response, next: NextFunction) => {
  if (request.method === 'POST' && request.path === '/auth/webgl-launch-context/resolve') {
    response.setHeader('Cache-Control', 'no-store')
  }

  next()
}

const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000
const FAILED_LOGIN_MAX_ATTEMPTS = 6
const FAILED_LOGIN_LOCK_MS = 20 * 60 * 1000
const FAILED_LOGIN_LOCK_ENABLED = false

const getLoginThrottleIp = (request: Request) => {
  const candidate = request.ip || request.socket.remoteAddress || 'unknown'
  return candidate.trim() || 'unknown'
}

const isStorySessionContextError = (error: WebglLaunchResolveError): error is StorySessionContextError =>
  error.code === 'STORY_NOT_FOUND' ||
  error.code === 'STORY_NOT_LINKED_TO_CHARACTER' ||
  error.code === 'CHARACTER_NOT_FOUND' ||
  error.code === 'EMAIL_VERIFICATION_REQUIRED' ||
  error.code === 'MEMBERSHIP_REQUIRED' ||
  error.code === 'CHARACTER_NOT_AVAILABLE_FOR_CHAT'

const mapWebglLaunchResolveErrorToApiCode = (error: WebglLaunchResolveError) => {
  if (isStorySessionContextError(error)) {
    return mapStorySessionContextErrorToApiCode(error)
  }

  return error.code
}

const getExpectedErrorDetails = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return null
  }

  return (error as { details?: Record<string, unknown> | null }).details ?? null
}

const getSessionTokensFromRequest = (request: Request) => {
  const tokenList: string[] = []
  const cookieToken = request.cookies?.[authConfig.cookieName]
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    tokenList.push(cookieToken)
  }

  const authorizationHeader = request.header('authorization')
  if (authorizationHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
    const bearerToken = match?.[1]?.trim()
    if (bearerToken && bearerToken.length > 0) {
      tokenList.push(bearerToken)
    }
  }

  return [...new Set(tokenList)]
}

const getLoginLockRemainingSeconds = async (ip: string, nowMs: number): Promise<number | null> => {
  const record = await prisma.failedLoginAttempt.findUnique({
    where: {
      ipAddress: ip
    },
    select: {
      windowStartAt: true,
      lockUntil: true
    }
  })

  if (!record) {
    return null
  }

  const lockUntilMs = record.lockUntil?.getTime() ?? null
  const windowStartMs = record.windowStartAt.getTime()
  const windowExpired = nowMs - windowStartMs > FAILED_LOGIN_WINDOW_MS
  const lockExpired = !lockUntilMs || lockUntilMs <= nowMs

  if (windowExpired && lockExpired) {
    await prisma.failedLoginAttempt.delete({
      where: {
        ipAddress: ip
      }
    })
    return null
  }

  if (!lockUntilMs || lockUntilMs <= nowMs) {
    return null
  }

  return Math.max(1, Math.ceil((lockUntilMs - nowMs) / 1000))
}

const recordFailedLoginAttempt = async (ip: string, nowMs: number) => {
  const existingRecord = await prisma.failedLoginAttempt.findUnique({
    where: {
      ipAddress: ip
    },
    select: {
      attempts: true,
      windowStartAt: true
    }
  })

  const nowDate = new Date(nowMs)
  if (!existingRecord || nowMs - existingRecord.windowStartAt.getTime() > FAILED_LOGIN_WINDOW_MS) {
    await prisma.failedLoginAttempt.upsert({
      where: {
        ipAddress: ip
      },
      update: {
        attempts: 1,
        windowStartAt: nowDate,
        lockUntil: null
      },
      create: {
        ipAddress: ip,
        attempts: 1,
        windowStartAt: nowDate,
        lockUntil: null
      }
    })
    return
  }

  const nextAttempts = existingRecord.attempts + 1
  const shouldLock = nextAttempts >= FAILED_LOGIN_MAX_ATTEMPTS
  await prisma.failedLoginAttempt.update({
    where: {
      ipAddress: ip
    },
    data: {
      attempts: nextAttempts,
      lockUntil: shouldLock ? new Date(nowMs + FAILED_LOGIN_LOCK_MS) : null
    }
  })
}

const clearFailedLoginAttempts = async (ip: string) => {
  await prisma.failedLoginAttempt.deleteMany({
    where: {
      ipAddress: ip
    }
  })
}

const frontendOrigin = new URL(oauthConfig.frontendPublicUrl).origin

const sanitizeRedirectAfter = (value: string | undefined) => {
  if (!value) {
    return oauthConfig.defaultRedirectAfter
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return oauthConfig.defaultRedirectAfter
  }

  try {
    const normalizedUrl = new URL(trimmed, oauthConfig.frontendPublicUrl)

    if (normalizedUrl.origin !== frontendOrigin) {
      return oauthConfig.defaultRedirectAfter
    }

    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`
  } catch {
    return oauthConfig.defaultRedirectAfter
  }
}

const buildFrontendRedirectUrl = (pathValue: string, extraParams: Record<string, string | undefined> = {}) => {
  const sanitizedPath = sanitizeRedirectAfter(pathValue)
  const redirectUrl = new URL(sanitizedPath, oauthConfig.frontendPublicUrl)

  for (const [key, value] of Object.entries(extraParams)) {
    if (!value) {
      continue
    }

    redirectUrl.searchParams.set(key, value)
  }

  return redirectUrl.toString()
}

const dispatchVerificationEmail = async (user: { id: string; email: string; username: string }, request: Request) => {
  const clientMeta = extractSessionClientMeta(request)
  const { rawToken, expiresAt } = await issueEmailVerificationToken(user.id, clientMeta)
  const verificationUrl = authConfig.verifyEmailUrlBase

  await emailService.sendVerificationEmail({
    toEmail: user.email,
    username: user.username,
    verificationCode: rawToken,
    verificationUrl,
    expiresAt
  })
}

const dispatchPasswordResetEmail = async (user: { id: string; email: string; username: string }, request: Request) => {
  const clientMeta = extractSessionClientMeta(request)
  const { rawToken, expiresAt } = await issuePasswordResetToken(user.id, clientMeta)
  const resetUrl = new URL(authConfig.resetPasswordUrlBase, oauthConfig.frontendPublicUrl)
  resetUrl.searchParams.set('token', rawToken)

  await emailService.sendPasswordResetEmail({
    toEmail: user.email,
    username: user.username,
    resetCode: rawToken,
    resetUrl: resetUrl.toString(),
    expiresAt
  })
}

const dispatchWelcomeEmail = async (user: { email: string; username: string }) => {
  const frontendUrl = oauthConfig.frontendPublicUrl

  await emailService.sendWelcomeEmail({
    toEmail: user.email,
    username: user.username,
    ctaUrl: `${frontendUrl}/members`,
    membersUrl: `${frontendUrl}/members`
  })
}

authRoutes.get('/auth/oauth/:provider/start', optionalAuth, async (request, response, next) => {
  try {
    const { provider } = z.object({ provider: z.string().trim().min(1) }).parse(request.params)
    const query = oauthStartQuerySchema.parse(request.query)

    if (!isOAuthProviderKey(provider)) {
      response.status(404).json({
        message: 'OAuth provider is not supported.'
      })
      return
    }

    let oauthProviderClient

    try {
      oauthProviderClient = getOAuthProviderClient(provider)
    } catch (error) {
      response.status(503).json({
        message: error instanceof Error ? error.message : 'OAuth provider is not available.'
      })
      return
    }

    const redirectAfter = sanitizeRedirectAfter(query.redirectAfter)
    const intent = query.intent ?? 'signin'
    const stateToken = issueOAuthState(response, provider, redirectAfter, intent)
    const authorizationUrl = oauthProviderClient.buildAuthorizationUrl(stateToken)

    response.redirect(302, authorizationUrl)
  } catch (error) {
    next(error)
  }
})

authRoutes.get('/auth/oauth/:provider/callback', optionalAuth, async (request, response, next) => {
  let callbackProviderKey: keyof typeof oauthProviderToSocialProviderMap | null = null
  let oauthStatePayload: ReturnType<typeof consumeOAuthState> | null = null

  const resolveOAuthErrorRedirectPath = (redirectAfter: string | undefined) => {
    if (!request.authUser) {
      return '/'
    }

    return redirectAfter ?? oauthConfig.defaultRedirectAfter
  }

  const redirectWithError = (redirectAfter: string | undefined, message: string, oauthErrorCode?: string) => {
    const redirectPath = resolveOAuthErrorRedirectPath(redirectAfter)

    response.redirect(
      302,
      buildFrontendRedirectUrl(redirectPath, {
        oauth: 'error',
        oauth_error: oauthErrorCode,
        message,
        openSignIn: request.authUser ? undefined : '1'
      })
    )
  }

  try {
    const { provider } = z.object({ provider: z.string().trim().min(1) }).parse(request.params)
    const query = oauthCallbackQuerySchema.parse(request.query)
    oauthStatePayload = consumeOAuthState(request, response)

    if (!isOAuthProviderKey(provider)) {
      redirectWithError(oauthStatePayload?.redirectAfter, 'OAuth provider is not supported.')
      return
    }

    callbackProviderKey = provider

    if (!oauthStatePayload) {
      redirectWithError(undefined, 'OAuth state is missing or expired.')
      return
    }

    if (oauthStatePayload.provider !== provider) {
      redirectWithError(oauthStatePayload.redirectAfter, 'OAuth provider mismatch.')
      return
    }

    if (query.error) {
      redirectWithError(oauthStatePayload.redirectAfter, 'OAuth sign-in was not completed.')
      return
    }

    if (!query.code || !query.state) {
      redirectWithError(oauthStatePayload.redirectAfter, 'Missing OAuth callback code or state.')
      return
    }

    if (query.state !== oauthStatePayload.stateToken) {
      redirectWithError(oauthStatePayload.redirectAfter, 'OAuth state verification failed.')
      return
    }

    let oauthProviderClient

    try {
      oauthProviderClient = getOAuthProviderClient(provider)
    } catch (error) {
      redirectWithError(
        oauthStatePayload.redirectAfter,
        error instanceof Error ? error.message : 'OAuth provider is not available.'
      )
      return
    }

    const oauthProfile = await oauthProviderClient.exchangeCodeForProfile(query.code)
    const socialProvider = oauthProviderToSocialProviderMap[provider]
    const resolvedUser = await resolveUserForOAuthAuthentication({
      provider: socialProvider,
      profile: oauthProfile,
      authenticatedUserId: request.authUser?.userId ?? null,
      intent: oauthStatePayload.intent
    })

    if (resolvedUser.isBanned) {
      redirectWithError(oauthStatePayload.redirectAfter, 'This account has been suspended.')
      return
    }

    const landingAttribution = await getLatestLandingAttributionForRequest(request)
    await claimLandingAcquisitionForUser(resolvedUser.id, landingAttribution)

    const rawSessionToken = await createOpaqueSessionForUser(resolvedUser.id, extractSessionClientMeta(request))
    setAuthCookie(response, rawSessionToken)

    if (resolvedUser.isNewlyCreated) {
      try {
        await dispatchWelcomeEmail(resolvedUser)
      } catch (sendError) {
        console.error('Failed to send welcome email after OAuth registration:', sendError)
      }
    }

    response.redirect(
      302,
      buildFrontendRedirectUrl(oauthStatePayload.redirectAfter, {
        oauth: 'success',
        provider,
        newUser: resolvedUser.isNewlyCreated ? '1' : '0',
        setPassword: resolvedUser.hasPassword ? undefined : '1'
      })
    )
  } catch (error) {
    const expectedErrorRedirect = buildOAuthCallbackExpectedErrorRedirect({
      error,
      providerKey: callbackProviderKey,
      redirectAfter: oauthStatePayload?.redirectAfter,
      isAuthenticated: Boolean(request.authUser)
    })

    if (expectedErrorRedirect) {
      recordRuntimeLogEntry(expectedErrorRedirect.runtimeLog.level, expectedErrorRedirect.runtimeLog.args)
      response.redirect(302, buildFrontendRedirectUrl(expectedErrorRedirect.redirectPath, expectedErrorRedirect.redirectParams))
      return
    }

    if (error instanceof Error) {
      console.error('OAuth callback failure:', error)
      const fallbackRedirectPath = oauthConfig.defaultRedirectAfter
      redirectWithError(fallbackRedirectPath, 'OAuth sign-in failed.', 'oauth_signin_failed')
      return
    }

    next(error)
  }
})

authRoutes.post('/auth/register', async (request, response, next) => {
  try {
    const landingAttribution = await getLatestLandingAttributionForRequest(request)
    const payload = registerSchema.parse(request.body)
    const normalizedEmail = payload.email.trim().toLowerCase()
    const normalizedUsername = payload.username.trim()

    const [existingByEmail, existingByUsername] = await Promise.all([
      prisma.user.findUnique({
        where: {
          email: normalizedEmail
        },
        select: {
          id: true
        }
      }),
      prisma.user.findUnique({
        where: {
          username: normalizedUsername
        },
        select: {
          id: true
        }
      })
    ])

    if (existingByEmail) {
      response.status(409).json({
        message: 'An account with this e-mail already exists.'
      })
      return
    }

    if (existingByUsername) {
      response.status(409).json({
        message: 'This username is already taken.'
      })
      return
    }

    const passwordHash = await hashPassword(payload.password)

    const createdUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        role: 'USER',
        isEmailVerified: false
      },
      select: {
        id: true,
        email: true,
        username: true,
        playerName: true,
        role: true,
        isEmailVerified: true,
        avatarUrl: true
      }
    })

    await claimLandingAcquisitionForUser(createdUser.id, landingAttribution)

    const rawSessionToken = await createOpaqueSessionForUser(createdUser.id, extractSessionClientMeta(request))
    setAuthCookie(response, rawSessionToken)

    let verificationEmailSent = false
    let welcomeEmailSent = false

    try {
      await dispatchVerificationEmail(createdUser, request)
      verificationEmailSent = true
    } catch (sendError) {
      console.error('Failed to send verification email after registration:', sendError)
    }

    try {
      await dispatchWelcomeEmail(createdUser)
      welcomeEmailSent = true
    } catch (sendError) {
      console.error('Failed to send welcome email after registration:', sendError)
    }

    response.status(201).json({
      data: {
        user: {
          id: createdUser.id,
          email: createdUser.email,
          username: createdUser.username,
          player_name: resolvePlayerName(createdUser.playerName, createdUser.username),
          role: getEffectiveUserRoleForTesting(createdUser.role),
          is_email_verified: createdUser.isEmailVerified,
          has_password: true,
          avatar_url: createdUser.avatarUrl,
          unread_notification_count: 0
        },
        requires_email_verification: true,
        verification_email_sent: verificationEmailSent,
        welcome_email_sent: welcomeEmailSent
      }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const conflictFields = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : []

      if (conflictFields.includes('email')) {
        response.status(409).json({
          message: 'An account with this e-mail already exists.'
        })
        return
      }

      if (conflictFields.includes('username')) {
        response.status(409).json({
          message: 'This username is already taken.'
        })
        return
      }

      response.status(409).json({
        message: 'Account information is already in use.'
      })
      return
    }

    next(error)
  }
})

authRoutes.post('/auth/resend-verification', optionalAuth, async (request, response, next) => {
  try {
    const payload = resendVerificationSchema.parse(request.body ?? {})
    const authUser = request.authUser

    if (authUser) {
      const existingUser = await prisma.user.findUnique({
        where: {
          id: authUser.userId
        },
        select: {
          id: true,
          email: true,
          username: true,
          isEmailVerified: true
        }
      })

      if (!existingUser) {
        response.status(401).json({
          message: 'Authentication required.'
        })
        return
      }

      if (existingUser.isEmailVerified) {
        response.json({
          data: {
            sent: false,
            already_verified: true
          }
        })
        return
      }

      await dispatchVerificationEmail(existingUser, request)
      response.json({
        data: {
          sent: true
        }
      })
      return
    }

    const normalizedEmail = payload.email?.trim().toLowerCase()

    if (!normalizedEmail) {
      response.json({
        data: {
          sent: true
        }
      })
      return
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail
      },
      select: {
        id: true,
        email: true,
        username: true,
        isEmailVerified: true
      }
    })

    if (existingUser && !existingUser.isEmailVerified) {
      await dispatchVerificationEmail(existingUser, request)
    }

    // Always return a generic response for public requests to avoid account enumeration.
    response.json({
      data: {
        sent: true
      }
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.get('/auth/verify-email', async (request, response, next) => {
  try {
    response.status(410).json({
      message: 'Verification via URL token is disabled. Sign in and submit your verification code.'
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/verify-email-code', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const payload = verifyEmailCodeSchema.parse(request.body)
    const activeToken = await findActiveEmailVerificationToken(payload.code)

    if (!activeToken || activeToken.userId !== authUser.userId) {
      response.status(400).json({
        message: 'Verification code is invalid or expired.'
      })
      return
    }

    const now = new Date()

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: authUser.userId
        },
        data: {
          isEmailVerified: true
        }
      }),
      prisma.emailVerificationToken.update({
        where: {
          id: activeToken.tokenId
        },
        data: {
          consumedAt: now
        }
      }),
      prisma.emailVerificationToken.updateMany({
        where: {
          userId: authUser.userId,
          consumedAt: null
        },
        data: {
          consumedAt: now
        }
      })
    ])

    response.json({
      data: {
        verified: true
      }
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/login', async (request, response, next) => {
  try {
    const nowMs = Date.now()
    const throttleIp = getLoginThrottleIp(request)
    if (FAILED_LOGIN_LOCK_ENABLED) {
      const lockRemainingSeconds = await getLoginLockRemainingSeconds(throttleIp, nowMs)
      if (lockRemainingSeconds !== null) {
        response.status(429).json({
          message: `Too many failed login attempts. Try again in ${lockRemainingSeconds} seconds.`
        })
        return
      }
    }

    const payload = loginSchema.parse(request.body)
    const normalizedEmail = payload.email.trim().toLowerCase()

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail
      },
      select: {
        id: true,
        email: true,
        username: true,
        playerName: true,
        role: true,
        isEmailVerified: true,
        isBanned: true,
        passwordHash: true,
        avatarUrl: true
      }
    })

    if (!existingUser?.passwordHash) {
      if (FAILED_LOGIN_LOCK_ENABLED) {
        await recordFailedLoginAttempt(throttleIp, nowMs)
      }
      response.status(401).json({
        message: 'Invalid e-mail or password.'
      })
      return
    }

    if (existingUser.isBanned) {
      response.status(403).json({
        message: 'This account has been suspended.'
      })
      return
    }

    const passwordMatches = await verifyPassword(payload.password, existingUser.passwordHash)

    if (!passwordMatches) {
      if (FAILED_LOGIN_LOCK_ENABLED) {
        await recordFailedLoginAttempt(throttleIp, nowMs)
      }
      response.status(401).json({
        message: 'Invalid e-mail or password.'
      })
      return
    }

    if (FAILED_LOGIN_LOCK_ENABLED) {
      await clearFailedLoginAttempts(throttleIp)
    }
    const rawSessionToken = await createOpaqueSessionForUser(existingUser.id, extractSessionClientMeta(request))
    setAuthCookie(response, rawSessionToken)

    const unreadNotificationCount = await getUnreadNotificationCount(existingUser.id)

    response.json({
      data: {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          username: existingUser.username,
          player_name: resolvePlayerName(existingUser.playerName, existingUser.username),
          role: getEffectiveUserRoleForTesting(existingUser.role),
          is_email_verified: existingUser.isEmailVerified,
          has_password: true,
          avatar_url: existingUser.avatarUrl,
          unread_notification_count: unreadNotificationCount
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Unity Desktop/VR bearer-token flow:
 * issue an opaque session token directly in JSON without setting browser cookies.
 */
authRoutes.post('/auth/unity-token', async (request, response, next) => {
  try {
    const nowMs = Date.now()
    const throttleIp = getLoginThrottleIp(request)
    if (FAILED_LOGIN_LOCK_ENABLED) {
      const lockRemainingSeconds = await getLoginLockRemainingSeconds(throttleIp, nowMs)
      if (lockRemainingSeconds !== null) {
        response.setHeader('Retry-After', String(lockRemainingSeconds))
        sendApiError(
          response,
          429,
          'RATE_LIMITED',
          `Too many failed login attempts. Try again in ${lockRemainingSeconds} seconds.`,
          {
            retry_after_seconds: lockRemainingSeconds
          }
        )
        return
      }
    }

    const payload = loginSchema.parse(request.body)
    const normalizedEmail = payload.email.trim().toLowerCase()

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail
      },
      select: {
        id: true,
        email: true,
        username: true,
        playerName: true,
        role: true,
        isEmailVerified: true,
        isBanned: true,
        passwordHash: true
      }
    })

    if (!existingUser?.passwordHash) {
      if (FAILED_LOGIN_LOCK_ENABLED) {
        await recordFailedLoginAttempt(throttleIp, nowMs)
      }
      sendApiError(response, 401, 'INVALID_CREDENTIALS', 'Invalid e-mail or password.')
      return
    }

    if (existingUser.isBanned) {
      sendApiError(response, 403, 'ACCOUNT_SUSPENDED', 'This account has been suspended.')
      return
    }

    const passwordMatches = await verifyPassword(payload.password, existingUser.passwordHash)

    if (!passwordMatches) {
      if (FAILED_LOGIN_LOCK_ENABLED) {
        await recordFailedLoginAttempt(throttleIp, nowMs)
      }
      sendApiError(response, 401, 'INVALID_CREDENTIALS', 'Invalid e-mail or password.')
      return
    }

    if (FAILED_LOGIN_LOCK_ENABLED) {
      await clearFailedLoginAttempts(throttleIp)
    }

    const effectiveTierCode = await resolveEffectiveMembershipTierForUser(existingUser.id)
    if (!isGameAccessAllowed(effectiveTierCode)) {
      sendMembershipRequiredError(response)
      return
    }

    const clientMeta = extractSessionClientMeta(request)
    const { rawSessionToken, expiresAt } = await createOpaqueSessionForUserWithExpiry(existingUser.id, clientMeta)

    sendApiData(response, {
      access_token: rawSessionToken,
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString(),
      user: {
        id: existingUser.id,
        email: existingUser.email,
        username: existingUser.username,
        player_name: resolvePlayerName(existingUser.playerName, existingUser.username),
        role: getEffectiveUserRoleForTesting(existingUser.role),
        is_email_verified: existingUser.isEmailVerified,
        has_password: true
      }
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/logout', async (request, response, next) => {
  try {
    const tokenList = getSessionTokensFromRequest(request)

    if (tokenList.length > 0) {
      await Promise.all(tokenList.map((token) => revokeOpaqueSessionByToken(token)))
    }

    clearAuthCookie(response)
    sendApiData(response, {
      logged_out: true
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/forgot-password', async (request, response, next) => {
  try {
    const payload = forgotPasswordSchema.parse(request.body)
    const normalizedEmail = payload.email.trim().toLowerCase()

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail
      },
      select: {
        id: true,
        email: true,
        username: true
      }
    })

    if (existingUser) {
      try {
        await dispatchPasswordResetEmail(existingUser, request)
      } catch (sendError) {
        console.error('Failed to send password reset email:', sendError)
      }
    }

    response.json({
      data: {
        sent: true
      }
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/reset-password', async (request, response, next) => {
  try {
    const payload = resetPasswordSchema.parse(request.body)
    const activeToken = await findActivePasswordResetToken(payload.token)

    if (!activeToken) {
      response.status(400).json({
        message: 'Reset token is invalid or expired.'
      })
      return
    }

    const nextPasswordHash = await hashPassword(payload.password)
    const now = new Date()

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: activeToken.userId
        },
        data: {
          passwordHash: nextPasswordHash
        }
      }),
      prisma.passwordResetToken.update({
        where: {
          id: activeToken.tokenId
        },
        data: {
          consumedAt: now
        }
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId: activeToken.userId,
          consumedAt: null
        },
        data: {
          consumedAt: now
        }
      }),
      prisma.session.updateMany({
        where: {
          userId: activeToken.userId,
          revokedAt: null
        },
        data: {
          revokedAt: now
        }
      })
    ])

    clearAuthCookie(response)
    response.json({
      data: {
        reset: true
      }
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/set-password', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = setPasswordSchema.parse(request.body)
    const existingUser = await prisma.user.findUnique({
      where: {
        id: authUser.userId
      },
      select: {
        id: true,
        passwordHash: true
      }
    })

    if (!existingUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Session user not found.')
      return
    }

    if (existingUser.passwordHash) {
      sendApiError(response, 409, 'PASSWORD_ALREADY_SET', 'Use password reset to change an existing password.')
      return
    }

    const passwordHash = await hashPassword(payload.password)
    await prisma.user.update({
      where: {
        id: existingUser.id
      },
      data: {
        passwordHash
      }
    })

    sendApiData(response, {
      set: true
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.get('/auth/me', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const [existingUser, unreadNotificationCount, effectiveTierCode, billingTierCents] = await Promise.all([
      prisma.user.findUnique({
        where: {
          id: authUser.userId
        },
        select: {
          id: true,
          email: true,
          username: true,
          playerName: true,
          role: true,
          isEmailVerified: true,
          passwordHash: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          tierCode: true,
          tier: {
            select: {
              code: true,
              messageLimit: true,
              periodDays: true,
              label: true
            }
          }
        }
      }),
      getUnreadNotificationCount(authUser.userId),
      resolveEffectiveMembershipTierForUser(authUser.userId),
      resolveUserBillingTierCents(authUser.userId)
    ])

    if (!existingUser) {
      clearAuthCookie(response)
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Session user not found.')
      return
    }

    const userPayload = {
      id: existingUser.id,
      email: existingUser.email,
      username: existingUser.username,
      player_name: resolvePlayerName(existingUser.playerName, existingUser.username),
      role: getEffectiveUserRoleForTesting(existingUser.role),
      is_email_verified: existingUser.isEmailVerified,
      has_password: Boolean(existingUser.passwordHash),
      avatar_url: existingUser.avatarUrl,
      created_at: existingUser.createdAt,
      updated_at: existingUser.updatedAt,
      tier_code: existingUser.tierCode,
      effective_tier_code: existingUser.role === 'ADMIN' ? 'admin' : effectiveTierCode,
      effective_tier_cents: existingUser.role === 'ADMIN' ? null : billingTierCents,
      tier: existingUser.tier
        ? {
            code: existingUser.tier.code,
            message_limit: existingUser.tier.messageLimit,
            period_days: existingUser.tier.periodDays,
            label: existingUser.tier.label
          }
        : null,
      unread_notification_count: unreadNotificationCount
    }

    sendApiData(response, {
      user: userPayload
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Mint a short-lived session token for Unity WebGL: call with browser cookie auth, then pass the
 * returned `token` to Unity (e.g. via SendMessage) and send `Authorization: Bearer <token>` on API requests.
 */
authRoutes.get('/auth/webgl-token', setNoStoreCacheControl, requireAuth, requireGameAccess, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const clientMeta = extractSessionClientMeta(request)
    const { rawSessionToken, expiresAt } = await createWebGlBridgeSessionForUser(authUser.userId, clientMeta)

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      data: {
        token: rawSessionToken,
        expires_at: expiresAt.toISOString(),
        token_type: 'Bearer'
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Website -> Unity WebGL launch handoff.
 * Website mints a short-lived launch context bound to user + selected story.
 */
authRoutes.post('/auth/webgl-launch-context', setNoStoreCacheControl, requireAuth, requireGameAccess, requireVerifiedEmail, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = webglLaunchContextIssueSchema.parse(request.body ?? {})
    const result = await issueWebglLaunchContext(authUser, {
      storyId: payload.story_id,
      launchMode: payload.launch_mode
    })

    if (!result.ok) {
      sendApiError(
        response,
        result.error.status,
        mapStorySessionContextErrorToApiCode(result.error),
        result.error.message,
        getExpectedErrorDetails(result.error)
      )
      return
    }

    sendApiData(response, {
      launch_token: result.data.launchToken,
      story_id: result.data.storyId,
      character_id: result.data.characterId,
      launch_mode: result.data.launchMode,
      expires_at: result.data.expiresAt.toISOString()
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Unity WebGL resolves a one-time launch token into a short-lived bearer plus
 * the already-selected story/session bootstrap payload.
 */
authRoutes.post('/auth/webgl-launch-context/resolve', setNoStoreCacheControl, async (request, response, next) => {
  try {
    const payload = webglLaunchContextResolveSchema.parse(request.body ?? {})
    const result = await resolveWebglLaunchContext(
      {
        launchToken: payload.launch_token
      },
      extractSessionClientMeta(request)
    )

    if (!result.ok) {
      sendApiError(
        response,
        result.error.status,
        mapWebglLaunchResolveErrorToApiCode(result.error),
        result.error.message,
        getExpectedErrorDetails(result.error)
      )
      return
    }

    sendApiData(response, result.data)
  } catch (error) {
    next(error)
  }
})

export { setWebglLaunchResolveNoStoreCacheControl }
export default authRoutes

