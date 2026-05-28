import type { SocialProvider } from '@prisma/client'
import type { RuntimeLogLevel } from '../../lib/runtime-log-buffer'
import { isOAuthAccountConflictError } from './oauth-account-errors'
import type { OAuthProviderKey } from './oauth-provider'

const AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE =
  'This SecretWaifu account is already linked to a different Google account. Sign out and use the linked Google account, or contact support if you need the link changed.'

type OAuthCallbackExpectedErrorRedirect = {
  redirectPath: string
  redirectParams: Record<string, string | undefined>
  runtimeLog: {
    level: RuntimeLogLevel
    args: unknown[]
  }
}

type OAuthCallbackExpectedErrorInput = {
  error: unknown
  providerKey: OAuthProviderKey | null
  redirectAfter: string | undefined
  isAuthenticated: boolean
}

const oauthProviderKeyBySocialProvider: Partial<Record<SocialProvider, OAuthProviderKey>> = {
  GOOGLE: 'google'
}

const resolveOAuthProviderKey = (
  providerKey: OAuthProviderKey | null,
  socialProvider: SocialProvider
): OAuthProviderKey | null => providerKey ?? oauthProviderKeyBySocialProvider[socialProvider] ?? null

const buildOAuthCallbackExpectedErrorRedirect = (
  input: OAuthCallbackExpectedErrorInput
): OAuthCallbackExpectedErrorRedirect | null => {
  if (!isOAuthAccountConflictError(input.error)) {
    return null
  }

  const provider = resolveOAuthProviderKey(input.providerKey, input.error.provider)
  const runtimeLog = {
    level: 'info' as const,
    args: [
      '[oauth] Expected OAuth account conflict.',
      {
        authenticated: input.isAuthenticated,
        context: input.error.context,
        provider: provider ?? 'unknown',
        reason: input.error.reason
      }
    ]
  }

  if (input.isAuthenticated) {
    return {
      redirectPath: input.redirectAfter ?? '/profile',
      redirectParams: {
        oauth: 'link_error',
        oauth_error: 'provider_account_conflict',
        provider: provider ?? undefined,
        message: AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE,
        openSignIn: undefined
      },
      runtimeLog
    }
  }

  return {
    redirectPath: '/',
    redirectParams: {
      oauth: 'error',
      oauth_error: 'oauth_signin_failed',
      provider: provider ?? undefined,
      message: 'OAuth sign-in failed.',
      openSignIn: '1'
    },
    runtimeLog
  }
}

export {
  AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE,
  buildOAuthCallbackExpectedErrorRedirect
}
export type {
  OAuthCallbackExpectedErrorRedirect
}
