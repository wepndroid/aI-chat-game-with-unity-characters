import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { getIsSecureCookie } from '../../lib/auth-config'
import { oauthConfig } from '../../lib/oauth-config'
import type { OAuthProviderKey } from './oauth-provider'

type OAuthStatePayload = {
  stateToken: string
  provider: OAuthProviderKey
  redirectAfter: string
  intent: 'signin' | 'signup'
  issuedAtMs: number
}

const oAuthStateSchema = z.object({
  stateToken: z.string().min(10),
  provider: z.enum(['google']),
  redirectAfter: z.string().min(1),
  intent: z.enum(['signin', 'signup']),
  issuedAtMs: z.number().int().nonnegative()
})

const encodeStatePayload = (payload: OAuthStatePayload) => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

const decodeStatePayload = (cookieValue: string) => {
  const rawPayload = Buffer.from(cookieValue, 'base64url').toString('utf8')
  const parsedPayload = JSON.parse(rawPayload) as unknown
  return oAuthStateSchema.parse(parsedPayload)
}

const setOAuthStateCookie = (response: Response, payload: OAuthStatePayload) => {
  response.cookie(oauthConfig.stateCookieName, encodeStatePayload(payload), {
    httpOnly: true,
    secure: getIsSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: oauthConfig.stateTtlMs
  })
}

const clearOAuthStateCookie = (response: Response) => {
  response.clearCookie(oauthConfig.stateCookieName, {
    httpOnly: true,
    secure: getIsSecureCookie(),
    sameSite: 'lax',
    path: '/'
  })
}

const issueOAuthState = (
  response: Response,
  provider: OAuthProviderKey,
  redirectAfter: string,
  intent: 'signin' | 'signup'
) => {
  const stateToken = randomBytes(24).toString('hex')

  setOAuthStateCookie(response, {
    stateToken,
    provider,
    redirectAfter,
    intent,
    issuedAtMs: Date.now()
  })

  return stateToken
}

const consumeOAuthState = (request: Request, response: Response) => {
  const rawCookie = request.cookies?.[oauthConfig.stateCookieName]
  clearOAuthStateCookie(response)

  if (typeof rawCookie !== 'string' || rawCookie.length === 0) {
    return null
  }

  try {
    const payload = decodeStatePayload(rawCookie)
    const expiresAtMs = payload.issuedAtMs + oauthConfig.stateTtlMs

    if (expiresAtMs <= Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export { clearOAuthStateCookie, consumeOAuthState, issueOAuthState }
