import { randomBytes } from 'node:crypto'
import { EntitlementStatus } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { exchangeAuthorizationCode } from '../lib/patreon-client'
import { getPatreonConfig, isPatreonOauthEnabled } from '../lib/patreon-config'
import { syncPatreonMembership } from '../lib/patreon-sync'
import { prisma } from '../lib/prisma'

const patreonRoutes = Router()

const connectQuerySchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(1).max(40).optional(),
  redirectAfter: z.string().trim().optional(),
  mode: z.enum(['json', 'redirect']).optional()
})

const statusQuerySchema = z.object({
  email: z.string().email()
})

const syncBodySchema = z.object({
  email: z.string().email()
})

const sanitizeRedirectAfter = (value: string | undefined) => {
  if (!value) {
    return '/members?patreon=connected'
  }

  if (!value.startsWith('/')) {
    return '/members?patreon=connected'
  }

  return value
}

const buildCallbackRedirectUrl = (path: string) => {
  const config = getPatreonConfig()
  return `${config.frontendUrl}${path}`
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

const ensureUser = async (email: string, usernameInput: string | undefined) => {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedUsernameBase =
    (usernameInput?.trim() || normalizedEmail.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '_') || 'user'

  const existingUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    }
  })

  if (existingUser) {
    return existingUser
  }

  let usernameCandidate = normalizedUsernameBase

  for (let index = 0; index < 5; index += 1) {
    try {
      const createdUser = await prisma.user.create({
        data: {
          email: normalizedEmail,
          username: usernameCandidate
        }
      })

      return createdUser
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error)) {
        throw error
      }

      usernameCandidate = `${normalizedUsernameBase}${randomBytes(2).toString('hex')}`
    }
  }

  throw new Error('Failed to create a unique user for Patreon connection.')
}

patreonRoutes.get('/patreon/connect', async (request, response, next) => {
  try {
    if (!isPatreonOauthEnabled()) {
      response.status(503).json({
        message: 'Patreon OAuth is not enabled on this environment.'
      })
      return
    }

    const query = connectQuerySchema.parse(request.query)
    const user = await ensureUser(query.email, query.username)
    const redirectAfter = sanitizeRedirectAfter(query.redirectAfter)
    const stateToken = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10)

    await prisma.patreonOAuthState.create({
      data: {
        stateToken,
        userId: user.id,
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

patreonRoutes.get('/patreon/status', async (request, response, next) => {
  try {
    const query = statusQuerySchema.parse(request.query)
    const user = await prisma.user.findUnique({
      where: {
        email: query.email.toLowerCase()
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

patreonRoutes.post('/patreon/sync', async (request, response, next) => {
  try {
    if (!isPatreonOauthEnabled()) {
      response.status(503).json({
        message: 'Patreon OAuth is not enabled on this environment.'
      })
      return
    }

    const payload = syncBodySchema.parse(request.body)
    const user = await prisma.user.findUnique({
      where: {
        email: payload.email.toLowerCase()
      }
    })

    if (!user) {
      response.status(404).json({
        message: 'User not found for Patreon sync.'
      })
      return
    }

    const syncResult = await syncPatreonMembership({
      userId: user.id
    })

    response.json({
      data: syncResult
    })
  } catch (error) {
    next(error)
  }
})

patreonRoutes.post('/patreon/disconnect', async (request, response, next) => {
  try {
    const payload = syncBodySchema.parse(request.body)
    const user = await prisma.user.findUnique({
      where: {
        email: payload.email.toLowerCase()
      }
    })

    if (!user) {
      response.status(404).json({
        message: 'User not found for Patreon disconnect.'
      })
      return
    }

    await prisma.$transaction([
      prisma.patreonOAuthState.deleteMany({
        where: {
          userId: user.id
        }
      }),
      prisma.patreonAccount.deleteMany({
        where: {
          userId: user.id
        }
      }),
      prisma.entitlement.updateMany({
        where: {
          userId: user.id,
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
