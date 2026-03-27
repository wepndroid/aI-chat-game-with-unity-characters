const PATREON_AUTHORIZE_URL = 'https://www.patreon.com/oauth2/authorize'
const PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token'
const PATREON_IDENTITY_URL =
  'https://www.patreon.com/api/oauth2/v2/identity?include=memberships,memberships.currently_entitled_tiers&fields%5Bmember%5D=patron_status,last_charge_status,last_charge_date,next_charge_date,currently_entitled_amount_cents&fields%5Btier%5D=title,amount_cents'

type PatreonConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  frontendUrl: string
  authorizeUrl: string
  tokenUrl: string
  identityUrl: string
}

const isPatreonOauthEnabled = () => process.env.PATREON_OAUTH_ENABLED === 'true'

const getPatreonConfig = (): PatreonConfig => {
  const clientId = process.env.PATREON_CLIENT_ID
  const clientSecret = process.env.PATREON_CLIENT_SECRET
  const redirectUri = process.env.PATREON_REDIRECT_URI
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:7000'
  const scopes = (process.env.PATREON_SCOPES ?? 'identity identity.memberships')
    .split(' ')
    .map((scope) => scope.trim())
    .filter(Boolean)

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Patreon OAuth is not configured. Missing PATREON_CLIENT_ID, PATREON_CLIENT_SECRET, or PATREON_REDIRECT_URI.'
    )
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    frontendUrl,
    authorizeUrl: PATREON_AUTHORIZE_URL,
    tokenUrl: PATREON_TOKEN_URL,
    identityUrl: PATREON_IDENTITY_URL
  }
}

export { getPatreonConfig, isPatreonOauthEnabled }
export type { PatreonConfig }
