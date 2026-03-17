import { GoogleOAuthProviderClient } from './google-oauth-provider'
import type { OAuthProviderClient, OAuthProviderKey } from './oauth-provider'

const oauthProviderKeys = ['google'] as const

const isOAuthProviderKey = (value: string): value is OAuthProviderKey => {
  return oauthProviderKeys.includes(value as (typeof oauthProviderKeys)[number])
}

const getOAuthProviderClient = (providerKey: OAuthProviderKey): OAuthProviderClient => {
  if (providerKey === 'google') {
    return new GoogleOAuthProviderClient()
  }

  throw new Error(`Unsupported OAuth provider: ${providerKey}`)
}

export { getOAuthProviderClient, isOAuthProviderKey, oauthProviderKeys }
