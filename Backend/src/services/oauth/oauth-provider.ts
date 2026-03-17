type OAuthProviderKey = 'google'

type OAuthProviderProfile = {
  providerUserId: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
  avatarUrl: string | null
}

interface OAuthProviderClient {
  providerKey: OAuthProviderKey
  buildAuthorizationUrl(stateToken: string): string
  exchangeCodeForProfile(code: string): Promise<OAuthProviderProfile>
}

export type { OAuthProviderClient, OAuthProviderKey, OAuthProviderProfile }
