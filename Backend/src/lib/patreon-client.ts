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

export { exchangeAuthorizationCode, fetchPatreonIdentity, refreshPatreonAccessToken }
export type { PatreonIdentityResponse, PatreonTokenPayload }
