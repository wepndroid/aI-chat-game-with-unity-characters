import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { EntitlementStatus, Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { exchangeAuthorizationCode, probePatreonAuthorizeConfiguration } from '../lib/patreon-client'
import { getPatreonConfig, isPatreonOauthEnabled } from '../lib/patreon-config'
import { appendPatreonSyncLog } from '../lib/patreon-sync-log'
import { deactivatePatreonMembership, syncPatreonMembership } from '../lib/patreon-sync'
import { requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { calculateMonthlyEquivalentCents, resolveBillingPeriodMonths } from '../lib/subscription-billing'
import { canTierAccessMemberBenefits } from '../lib/membership-tier-policy'
import { resolveEffectiveMembershipTierForUser } from '../services/membership/membership-tier-service'

const patreonRoutes = Router()

const connectQuerySchema = z.object({
  redirectAfter: z.string().trim().optional(),
  mode: z.enum(['json', 'redirect']).optional()
})

const patreonWebhookPayloadSchema = z
  .object({
    data: z
      .object({
        id: z.string().optional(),
        relationships: z
          .object({
            user: z
              .object({
                data: z
                  .object({
                    id: z.string().optional()
                  })
                  .optional()
              })
              .optional()
          })
          .optional()
      })
      .optional()
  })
  .passthrough()

const defaultPatreonRedirectAfter = '/members?patreon=connected'

const normalizePatreonSignature = (signature: string | null | undefined) => {
  if (!signature) {
    return null
  }

  const trimmed = signature.trim()
  if (!trimmed) {
    return null
  }

  // Some senders include an algorithm prefix (e.g. "md5=<hex>").
  const equalsIndex = trimmed.indexOf('=')
  const normalized = equalsIndex >= 0 ? trimmed.slice(equalsIndex + 1) : trimmed
  return normalized.trim().toLowerCase()
}

const isValidHexDigest = (value: string) => /^[a-f0-9]+$/i.test(value)

const verifyPatreonWebhookSignature = (input: { rawBody: string; signature: string; secret: string }) => {
  const normalizedSignature = normalizePatreonSignature(input.signature)
  if (!normalizedSignature || !isValidHexDigest(normalizedSignature)) {
    return false
  }

  const expectedSignature = createHmac('md5', input.secret).update(input.rawBody, 'utf8').digest('hex')
  const providedBuffer = Buffer.from(normalizedSignature, 'hex')
  const expectedBuffer = Buffer.from(expectedSignature, 'hex')

  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
}

const sanitizeRedirectAfter = (value: string | undefined) => {
  if (!value) {
    return defaultPatreonRedirectAfter
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return defaultPatreonRedirectAfter
  }

  try {
    const config = getPatreonConfig()
    const frontendOrigin = new URL(config.frontendUrl).origin
    const normalizedUrl = new URL(trimmed, config.frontendUrl)

    if (normalizedUrl.origin !== frontendOrigin) {
      return defaultPatreonRedirectAfter
    }

    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`
  } catch {
    return defaultPatreonRedirectAfter
  }
}

const buildCallbackRedirectUrl = (path: string) => {
  const config = getPatreonConfig()
  const safePath = sanitizeRedirectAfter(path)
  return new URL(safePath, config.frontendUrl).toString()
}

const buildPatreonAuthorizationUrl = (stateToken: string) => {
  const config = getPatreonConfig()
  const url = new URL(config.authorizeUrl)

  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', stateToken)

  return url.toString()
}

const normalizeCallbackErrorMessage = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'This Patreon account is already linked to another SecretWaifu account.'
  }

  if (error instanceof Error) {
    const message = error.message ?? ''

    if (message.includes('PATREON_TOKEN_ENCRYPTION_KEY')) {
      return 'Patreon connection is temporarily unavailable due to server configuration. Please contact support.'
    }

    if (message.includes('Patreon OAuth is not configured')) {
      return 'Patreon connection is temporarily unavailable due to server configuration. Please contact support.'
    }

    if (message.startsWith('Patreon API request failed')) {
      return 'Patreon connection failed. Please try again in a moment.'
    }

    return 'Patreon connection failed. Please try again.'
  }

  return 'Patreon connection failed. Please try again.'
}

const isPatreonUnlinkedSyncError = (error: unknown) =>
  error instanceof Error && error.message.trim() === 'Patreon account is not linked for this user.'

patreonRoutes.get('/patreon/connect', requireVerifiedEmail, async (request, response, next) => {
  try {
    if (!isPatreonOauthEnabled()) {
      response.status(503).json({
        message: 'Patreon OAuth is not enabled on this environment.'
      })
      return
    }

    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    await probePatreonAuthorizeConfiguration()

    const query = connectQuerySchema.parse(request.query)
    const redirectAfter = sanitizeRedirectAfter(query.redirectAfter)
    const stateToken = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10)

    await prisma.patreonOAuthState.create({
      data: {
        stateToken,
        userId: authUser.userId,
        redirectAfter,
        expiresAt
      }
    })

    const authorizationUrl = buildPatreonAuthorizationUrl(stateToken)

    if (query.mode === 'redirect') {
      response.redirect(302, authorizationUrl)
      return
    }

    response.json({
      data: {
        authorizationUrl
      }
    })
  } catch (error) {
    next(error)
  }
})

patreonRoutes.get('/patreon/oauth/callback', async (request, response, next) => {
  let resolvedOauthStateUserId: string | null = null
  try {
    const callbackQuery = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional()
      })
      .parse(request.query)

    if (callbackQuery.error) {
      const message = encodeURIComponent(callbackQuery.error_description ?? callbackQuery.error)
      response.redirect(302, buildCallbackRedirectUrl(`/members?patreon=error&message=${message}`))
      return
    }

    if (!callbackQuery.code || !callbackQuery.state) {
      response.redirect(302, buildCallbackRedirectUrl('/members?patreon=error&message=Missing+OAuth+code+or+state'))
      return
    }

    const oauthState = await prisma.patreonOAuthState.findUnique({
      where: {
        stateToken: callbackQuery.state
      }
    })

    if (!oauthState) {
      response.redirect(302, buildCallbackRedirectUrl('/members?patreon=error&message=Invalid+OAuth+state'))
      return
    }

    if (oauthState.expiresAt.getTime() < Date.now()) {
      await prisma.patreonOAuthState.deleteMany({
        where: {
          id: oauthState.id
        }
      })
      response.redirect(302, buildCallbackRedirectUrl('/members?patreon=error&message=OAuth+state+expired'))
      return
    }

    resolvedOauthStateUserId = oauthState.userId

    const tokenPayload = await exchangeAuthorizationCode(callbackQuery.code)
    const syncResult = await syncPatreonMembership({
      userId: oauthState.userId,
      tokenPayload,
      logSource: 'oauth_callback',
      logTrigger: 'oauth_callback'
    })

    await prisma.patreonOAuthState.deleteMany({
      where: {
        id: oauthState.id
      }
    })

    const redirectAfter = sanitizeRedirectAfter(oauthState.redirectAfter ?? undefined)
    const successPath = `${redirectAfter}${redirectAfter.includes('?') ? '&' : '?'}patreon=connected&tier=${syncResult.tierCode}`

    response.redirect(302, buildCallbackRedirectUrl(successPath))
  } catch (error) {
    console.error(error)
    if (resolvedOauthStateUserId) {
      await appendPatreonSyncLog({
        userId: resolvedOauthStateUserId,
        source: 'oauth_callback',
        eventType: 'sync_error',
        level: 'ERROR',
        message: normalizeCallbackErrorMessage(error),
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {})
    }
    const message = encodeURIComponent(normalizeCallbackErrorMessage(error))
    try {
      response.redirect(302, buildCallbackRedirectUrl(`/members?patreon=error&message=${message}`))
    } catch (redirectError) {
      next(redirectError)
    }
  }
})

patreonRoutes.get('/patreon/status', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    // Admins always have premium-level access regardless of Patreon linkage.
    if (authUser.role === 'ADMIN') {
      response.json({
        data: {
          linked: true,
          membershipStatus: 'active_patron',
          tierCents: 1650,
          effectiveTierCode: 'admin',
          hasMemberBenefits: true,
          patreonUserId: 'admin-override',
          lastCheckedAt: new Date().toISOString(),
          nextChargeDate: null,
          entitlements: [
            {
              id: 'admin-override-entitlement',
              tierCode: 'premium',
              status: 'ACTIVE',
              validFrom: null,
              validUntil: null
            }
          ]
        }
      })
      return
    }

    const user = await prisma.user.findUnique({
      where: {
        id: authUser.userId
      },
      include: {
        patreonAccount: true,
        entitlementGrants: {
          where: {
            source: 'PATREON'
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    })

    if (!user) {
      response.json({
        data: {
          linked: false,
          membershipStatus: 'not-connected',
          tierCents: 0,
          effectiveTierCode: 'free',
          hasMemberBenefits: false,
          entitlements: []
        }
      })
      return
    }

    const billingPeriodMonths = resolveBillingPeriodMonths({
      pledgeCadenceMonths: user.patreonAccount?.pledgeCadenceMonths,
      lastChargeDate: user.patreonAccount?.lastChargeDate,
      nextChargeDate: user.patreonAccount?.nextChargeDate
    })

    const effectiveTierCode = await resolveEffectiveMembershipTierForUser(authUser.userId)

    response.json({
      data: {
        linked: Boolean(user.patreonAccount),
        membershipStatus: user.patreonAccount?.membershipStatus ?? 'not-connected',
        tierCents: calculateMonthlyEquivalentCents(user.patreonAccount?.tierCents ?? 0, billingPeriodMonths),
        effectiveTierCode,
        hasMemberBenefits: canTierAccessMemberBenefits(effectiveTierCode),
        patreonUserId: user.patreonAccount?.patreonUserId ?? null,
        lastCheckedAt: user.patreonAccount?.lastCheckedAt?.toISOString() ?? null,
        nextChargeDate: user.patreonAccount?.nextChargeDate?.toISOString() ?? null,
        entitlements: user.entitlementGrants.map((entitlement) => ({
          id: entitlement.id,
          tierCode: entitlement.tierCode,
          status: entitlement.status,
          validFrom: entitlement.validFrom?.toISOString() ?? null,
          validUntil: entitlement.validUntil?.toISOString() ?? null
        }))
      }
    })
  } catch (error) {
    next(error)
  }
})

patreonRoutes.post('/patreon/sync', requireVerifiedEmail, async (request, response, next) => {
  try {
    if (!isPatreonOauthEnabled()) {
      response.status(503).json({
        message: 'Patreon OAuth is not enabled on this environment.'
      })
      return
    }

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
        id: true
      }
    })

    if (!existingUser) {
      response.status(404).json({
        message: 'Session user not found for Patreon sync.'
      })
      return
    }

    const syncResult = await syncPatreonMembership({
      userId: authUser.userId,
      logSource: 'user_sync',
      logActorUserId: authUser.userId,
      logActorLabel: authUser.email,
      logTrigger: 'user_refresh'
    })

    response.json({
      data: syncResult
    })
  } catch (error) {
    if (isPatreonUnlinkedSyncError(error)) {
      response.status(409).json({
        message: 'Patreon account is not linked for this user.'
      })
      return
    }

    const authUser = request.authUser
    if (authUser) {
      await appendPatreonSyncLog({
        userId: authUser.userId,
        source: 'user_sync',
        eventType: 'sync_error',
        level: 'ERROR',
        message: error instanceof Error ? error.message : 'Patreon sync failed.',
        actorUserId: authUser.userId,
        actorLabel: authUser.email,
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {})
    }
    next(error)
  }
})

patreonRoutes.post('/patreon/disconnect', requireVerifiedEmail, async (request, response, next) => {
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
        id: true
      }
    })

    if (!existingUser) {
      response.status(404).json({
        message: 'Session user not found for Patreon disconnect.'
      })
      return
    }

    await prisma.$transaction([
      prisma.patreonOAuthState.deleteMany({
        where: {
          userId: authUser.userId
        }
      }),
      prisma.patreonAccount.deleteMany({
        where: {
          userId: authUser.userId
        }
      }),
      prisma.entitlement.updateMany({
        where: {
          userId: authUser.userId,
          source: 'PATREON'
        },
        data: {
          status: EntitlementStatus.INACTIVE,
          tierCode: 'inactive',
          validUntil: new Date()
        }
      })
    ])

    await appendPatreonSyncLog({
      userId: authUser.userId,
      source: 'user_disconnect',
      eventType: 'disconnect',
      level: 'WARN',
      message: 'Patreon account was disconnected by the user.',
      actorUserId: authUser.userId,
      actorLabel: authUser.email
    })

    response.json({
      data: {
        disconnected: true
      }
    })
  } catch (error) {
    next(error)
  }
})

patreonRoutes.post('/patreon/webhook', async (request, response, next) => {
  try {
    const expectedSharedSecret = process.env.PATREON_WEBHOOK_SHARED_SECRET?.trim()
    if (expectedSharedSecret) {
      const rawBody = (request as typeof request & { rawBody?: string }).rawBody ?? ''
      const providedSignature = request.get('x-patreon-signature')?.trim() ?? null
      const providedLegacySecret = request.get('x-patreon-webhook-secret')?.trim()
      const signatureMatches =
        rawBody.length > 0 &&
        Boolean(providedSignature) &&
        verifyPatreonWebhookSignature({
          rawBody,
          signature: providedSignature as string,
          secret: expectedSharedSecret
        })
      const legacySecretMatches = Boolean(providedLegacySecret) && providedLegacySecret === expectedSharedSecret

      if (!signatureMatches && !legacySecretMatches) {
        response.status(401).json({
          message: 'Invalid Patreon webhook signature.'
        })
        return
      }
    }

    const eventType = request.get('x-patreon-event')?.trim().toLowerCase() ?? 'unknown'
    const parsedBody = patreonWebhookPayloadSchema.safeParse(request.body)
    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Invalid Patreon webhook payload.'
      })
      return
    }

    const payload = parsedBody.data
    const campaignMemberId = payload.data?.id?.trim() || null
    const patreonUserId = payload.data?.relationships?.user?.data?.id?.trim() || null

    const linkedAccount =
      (campaignMemberId
        ? await prisma.patreonAccount.findFirst({
            where: { campaignMemberId },
            select: { userId: true }
          })
        : null) ??
      (patreonUserId
        ? await prisma.patreonAccount.findFirst({
            where: { patreonUserId },
            select: { userId: true }
          })
        : null)

    if (!linkedAccount) {
      response.status(202).json({
        data: {
          accepted: true,
          synced: false,
          reason: 'account_not_linked',
          event_type: eventType
        }
      })
      return
    }

    const isDeleteLikeEvent =
      eventType === 'members:delete' || eventType === 'members:pledge:delete' || eventType.endsWith(':delete')
    const syncResult = isDeleteLikeEvent
      ? await deactivatePatreonMembership({
          userId: linkedAccount.userId,
          membershipStatus: eventType,
          logSource: 'webhook',
          logTrigger: eventType
        })
      : await syncPatreonMembership({
          userId: linkedAccount.userId,
          logSource: 'webhook',
          logTrigger: eventType
        })

    response.status(200).json({
      data: {
        accepted: true,
        synced: true,
        event_type: eventType,
        user_id: linkedAccount.userId,
        membership_status: 'membershipStatus' in syncResult ? syncResult.membershipStatus : eventType,
        tier_code: syncResult.tierCode,
        entitlement_status: syncResult.entitlementStatus
      }
    })
  } catch (error) {
    next(error)
  }
})

export default patreonRoutes
