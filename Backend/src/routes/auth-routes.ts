import { Prisma, type SocialProvider } from '@prisma/client'
import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { clearAuthCookie, setAuthCookie } from '../lib/auth-cookie'
import { authConfig, getEffectiveUserRoleForTesting } from '../lib/auth-config'
import { oauthConfig } from '../lib/oauth-config'
import { hashPassword, verifyPassword } from '../lib/password-hash'
import { optionalAuth, requireAuth } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import {
  findActiveEmailVerificationToken,
  findActivePasswordResetToken,
  issueEmailVerificationToken,
  issuePasswordResetToken
} from '../services/auth-token-service'
import { createOpaqueSessionForUser, extractSessionClientMeta, revokeOpaqueSessionByToken } from '../services/auth-service'
import { emailService } from '../services/email-service'
import { resolveUserForOAuthAuthentication } from '../services/oauth/oauth-account-service'
import { getOAuthProviderClient, isOAuthProviderKey } from '../services/oauth/oauth-provider-registry'
import { consumeOAuthState, issueOAuthState } from '../services/oauth/oauth-state-service'

const authRoutes = Router()

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128)
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
})

const resendVerificationSchema = z.object({
  email: z.string().email().optional()
})

const verifyEmailQuerySchema = z.object({
  token: z.string().min(6).max(500)
})

const verifyEmailCodeSchema = z.object({
  code: z.string().trim().min(6).max(32)
})

const forgotPasswordSchema = z.object({
  email: z.string().email()
})

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(500),
  password: z.string().min(8).max(128)
})

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

const buildTokenLink = (baseUrl: string, rawToken: string) => {
  const url = new URL(baseUrl)
  url.searchParams.set('token', rawToken)
  return url.toString()
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
  const verificationUrl = buildTokenLink(authConfig.verifyEmailUrlBase, rawToken)

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
  const resetUrl = buildTokenLink(authConfig.resetPasswordUrlBase, rawToken)

  await emailService.sendPasswordResetEmail({
    toEmail: user.email,
    username: user.username,
    resetUrl,
    expiresAt
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
  const resolveOAuthErrorRedirectPath = (redirectAfter: string | undefined) => {
    if (!request.authUser) {
      return '/'
    }

    return redirectAfter ?? oauthConfig.defaultRedirectAfter
  }

  const redirectWithError = (redirectAfter: string | undefined, message: string) => {
    const redirectPath = resolveOAuthErrorRedirectPath(redirectAfter)

    response.redirect(
      302,
      buildFrontendRedirectUrl(redirectPath, {
        oauth: 'error',
        message,
        openSignIn: request.authUser ? undefined : '1'
      })
    )
  }

  try {
    const { provider } = z.object({ provider: z.string().trim().min(1) }).parse(request.params)
    const query = oauthCallbackQuerySchema.parse(request.query)
    const oauthStatePayload = consumeOAuthState(request, response)

    if (!isOAuthProviderKey(provider)) {
      redirectWithError(oauthStatePayload?.redirectAfter, 'OAuth provider is not supported.')
      return
    }

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

    const rawSessionToken = await createOpaqueSessionForUser(resolvedUser.id, extractSessionClientMeta(request))
    setAuthCookie(response, rawSessionToken)

    response.redirect(
      302,
      buildFrontendRedirectUrl(oauthStatePayload.redirectAfter, {
        oauth: 'success',
        provider
      })
    )
  } catch (error) {
    if (error instanceof Error) {
      console.error('OAuth callback failure:', error)
      const fallbackRedirectPath = oauthConfig.defaultRedirectAfter
      redirectWithError(fallbackRedirectPath, 'OAuth sign-in failed.')
      return
    }

    next(error)
  }
})

authRoutes.post('/auth/register', async (request, response, next) => {
  try {
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
        role: true,
        isEmailVerified: true
      }
    })

    const rawSessionToken = await createOpaqueSessionForUser(createdUser.id, extractSessionClientMeta(request))
    setAuthCookie(response, rawSessionToken)

    let verificationEmailSent = false

    try {
      await dispatchVerificationEmail(createdUser, request)
      verificationEmailSent = true
    } catch (sendError) {
      console.error('Failed to send verification email after registration:', sendError)
    }

    response.status(201).json({
      data: {
        user: {
          ...createdUser,
          role: getEffectiveUserRoleForTesting(createdUser.role)
        },
        requiresEmailVerification: true,
        verificationEmailSent
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
            alreadyVerified: true
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
    const query = verifyEmailQuerySchema.parse(request.query)
    const activeToken = await findActiveEmailVerificationToken(query.token)

    if (!activeToken) {
      response.status(400).json({
        message: 'Verification token is invalid or expired.'
      })
      return
    }

    const now = new Date()

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: activeToken.userId
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
          userId: activeToken.userId,
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
        role: true,
        isEmailVerified: true,
        isBanned: true,
        passwordHash: true
      }
    })

    if (!existingUser?.passwordHash) {
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
      response.status(401).json({
        message: 'Invalid e-mail or password.'
      })
      return
    }

    const rawSessionToken = await createOpaqueSessionForUser(existingUser.id, extractSessionClientMeta(request))
    setAuthCookie(response, rawSessionToken)

    response.json({
      data: {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          username: existingUser.username,
          role: getEffectiveUserRoleForTesting(existingUser.role),
          isEmailVerified: existingUser.isEmailVerified
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/auth/logout', async (request, response, next) => {
  try {
    const rawSessionToken = request.cookies?.[authConfig.cookieName]

    if (typeof rawSessionToken === 'string' && rawSessionToken.length > 0) {
      await revokeOpaqueSessionByToken(rawSessionToken)
    }

    clearAuthCookie(response)
    response.json({
      data: {
        loggedOut: true
      }
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
        username: true,
        passwordHash: true
      }
    })

    if (existingUser?.passwordHash) {
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

authRoutes.get('/auth/me', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: authUser.userId
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!existingUser) {
      clearAuthCookie(response)
      response.status(401).json({
        message: 'Session user not found.'
      })
      return
    }

    response.json({
      data: {
        user: {
          ...existingUser,
          role: getEffectiveUserRoleForTesting(existingUser.role)
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

export default authRoutes

