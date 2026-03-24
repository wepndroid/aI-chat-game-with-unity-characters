import { getPatreonConfig } from './patreon-config'

type PatreonTokenPayload = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

type PatreonIdentityResponse = {
  data: {
    id: string
    type: string
    relationships?: {
      memberships?: {
        data?: Array<{
          id: string
          type: string
        }>
      }
    }
  }
  included?: Array<{
    id: string
    type: string
    attributes?: Record<string, unknown>
    relationships?: Record<string, unknown>
  }>
}

type PatreonAuthorizeProbeCache = {
  valid: boolean
  message: string | null
  expiresAtMs: number
}

let patreonAuthorizeProbeCache: PatreonAuthorizeProbeCache | null = null

const assertOk = async (response: Response) => {
  if (response.ok) {
    return
  }

  const text = await response.text()
  throw new Error(`Patreon API request failed (${response.status}): ${text}`)
}

const exchangeAuthorizationCode = async (authorizationCode: string): Promise<PatreonTokenPayload> => {
  const config = getPatreonConfig()
  const body = new URLSearchParams({
    code: authorizationCode,
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri
  })

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  await assertOk(response)
  return (await response.json()) as PatreonTokenPayload
}

const refreshPatreonAccessToken = async (refreshToken: string): Promise<PatreonTokenPayload> => {
  const config = getPatreonConfig()
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret
  })

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  await assertOk(response)
  return (await response.json()) as PatreonTokenPayload
}

const fetchPatreonIdentity = async (accessToken: string): Promise<PatreonIdentityResponse> => {
  const config = getPatreonConfig()

  const response = await fetch(config.identityUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  })

  await assertOk(response)
  return (await response.json()) as PatreonIdentityResponse
}

const normalizeResponseText = (value: string) => value.trim().toLowerCase()

const probePatreonAuthorizeConfiguration = async (): Promise<void> => {
  const nowMs = Date.now()

  if (patreonAuthorizeProbeCache && patreonAuthorizeProbeCache.expiresAtMs > nowMs) {
    if (!patreonAuthorizeProbeCache.valid) {
      throw new Error(patreonAuthorizeProbeCache.message ?? 'Patreon OAuth authorization is not available.')
    }

    return
  }

  const config = getPatreonConfig()
  const probeUrl = new URL(config.authorizeUrl)

  probeUrl.searchParams.set('response_type', 'code')
  probeUrl.searchParams.set('client_id', config.clientId)
  probeUrl.searchParams.set('redirect_uri', config.redirectUri)
  probeUrl.searchParams.set('scope', config.scopes.join(' '))
  probeUrl.searchParams.set('state', 'patreon_oauth_probe')

  const response = await fetch(probeUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'application/json, text/html;q=0.9, */*;q=0.8'
    }
  })

  const responseText = await response.text().catch(() => '')
  const normalizedResponseText = normalizeResponseText(responseText)

  if (response.status >= 400) {
    const redirectUriNotAllowed =
      normalizedResponseText.includes('redirect uri') && normalizedResponseText.includes('not supported by client')

    const message = redirectUriNotAllowed
      ? 'Patreon connection is temporarily unavailable due to OAuth redirect configuration. Please contact support.'
      : 'Patreon connection is temporarily unavailable. Please try again later.'

    patreonAuthorizeProbeCache = {
      valid: false,
      message,
      expiresAtMs: nowMs + 60 * 1000
    }

    throw new Error(message)
  }

  patreonAuthorizeProbeCache = {
    valid: true,
    message: null,
    expiresAtMs: nowMs + 5 * 60 * 1000
  }
}

export { exchangeAuthorizationCode, fetchPatreonIdentity, probePatreonAuthorizeConfiguration, refreshPatreonAccessToken }
export type { PatreonIdentityResponse, PatreonTokenPayload }
