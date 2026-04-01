import { randomBytes } from 'node:crypto'
import { EntitlementStatus } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { exchangeAuthorizationCode, probePatreonAuthorizeConfiguration } from '../lib/patreon-client'
import { getPatreonConfig, isPatreonOauthEnabled } from '../lib/patreon-config'
import { syncPatreonMembership } from '../lib/patreon-sync'
import { requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'

const patreonRoutes = Router()

const connectQuerySchema = z.object({
  redirectAfter: z.string().trim().optional(),
  mode: z.enum(['json', 'redirect']).optional()
})

const defaultPatreonRedirectAfter = '/members?patreon=connected'

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
      await prisma.patreonOAuthState.delete({
        where: {
          id: oauthState.id
        }
      })
      response.redirect(302, buildCallbackRedirectUrl('/members?patreon=error&message=OAuth+state+expired'))
      return
    }

    const tokenPayload = await exchangeAuthorizationCode(callbackQuery.code)
    const syncResult = await syncPatreonMembership({
      userId: oauthState.userId,
      tokenPayload
    })

    await prisma.patreonOAuthState.delete({
      where: {
        id: oauthState.id
      }
    })

    const redirectAfter = sanitizeRedirectAfter(oauthState.redirectAfter ?? undefined)
    const successPath = `${redirectAfter}${redirectAfter.includes('?') ? '&' : '?'}patreon=connected&tier=${syncResult.tierCode}`

    response.redirect(302, buildCallbackRedirectUrl(successPath))
  } catch (error) {
    next(error)
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
          patreonUserId: 'admin-override',
          lastCheckedAt: new Date().toISOString(),
          nextChargeDate: null,
          entitlements: [
            {
              id: 'admin-override-entitlement',
              tierCode: 'secretwaifu_access',
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
          entitlements: []
        }
      })
      return
    }

    response.json({
      data: {
        linked: Boolean(user.patreonAccount),
        membershipStatus: user.patreonAccount?.membershipStatus ?? 'not-connected',
        tierCents: user.patreonAccount?.tierCents ?? 0,
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
      userId: authUser.userId
    })

    response.json({
      data: syncResult
    })
  } catch (error) {
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

    response.json({
      data: {
        disconnected: true
      }
    })
  } catch (error) {
    next(error)
  }
})

export default patreonRoutes
