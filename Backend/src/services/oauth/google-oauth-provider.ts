import { z } from 'zod'
import { googleOAuthConfig } from '../../lib/oauth-config'
import type { OAuthProviderClient, OAuthProviderProfile } from './oauth-provider'

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

const googleTokenSchema = z.object({
  access_token: z.string().min(1)
})

const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional()
})

class GoogleOAuthProviderClient implements OAuthProviderClient {
  readonly providerKey = 'google' as const

  constructor() {
    if (!googleOAuthConfig.enabled) {
      throw new Error('Google OAuth is disabled. Set GOOGLE_OAUTH_ENABLED=true and configure Google OAuth credentials.')
    }

    if (!googleOAuthConfig.clientId || !googleOAuthConfig.clientSecret || !googleOAuthConfig.redirectUri) {
      throw new Error('Google OAuth is not configured. Missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_OAUTH_REDIRECT_URI.')
    }
  }

  buildAuthorizationUrl(stateToken: string) {
    const url = new URL(GOOGLE_AUTHORIZE_URL)

    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', googleOAuthConfig.clientId)
    url.searchParams.set('redirect_uri', googleOAuthConfig.redirectUri)
    url.searchParams.set('scope', googleOAuthConfig.scopes.join(' '))
    url.searchParams.set('state', stateToken)
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', 'select_account')

    return url.toString()
  }

  async exchangeCodeForProfile(code: string): Promise<OAuthProviderProfile> {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: googleOAuthConfig.clientId,
        client_secret: googleOAuthConfig.clientSecret,
        redirect_uri: googleOAuthConfig.redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text().catch(() => 'Unknown error')
      throw new Error(`Google token exchange failed (${tokenResponse.status}): ${errorText}`)
    }

    const tokenPayload = googleTokenSchema.parse(await tokenResponse.json())
    const accessToken = tokenPayload.access_token

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text().catch(() => 'Unknown error')
      throw new Error(`Google userinfo fetch failed (${userInfoResponse.status}): ${errorText}`)
    }

    const userInfo = googleUserInfoSchema.parse(await userInfoResponse.json())

    return {
      providerUserId: userInfo.sub,
      email: userInfo.email?.toLowerCase() ?? null,
      emailVerified: Boolean(userInfo.email_verified),
      displayName: userInfo.name ?? null,
      avatarUrl: userInfo.picture ?? null
    }
  }
}

export { GoogleOAuthProviderClient }
