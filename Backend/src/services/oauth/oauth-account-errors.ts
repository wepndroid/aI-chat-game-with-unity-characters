import type { SocialProvider } from '@prisma/client'

type OAuthAccountConflictReason =
  | 'provider_identity_belongs_to_other_user'
  | 'user_already_has_different_provider_identity'
  | 'duplicate_provider_identity_race'

type OAuthAccountConflictContext =
  | 'authenticated_link'
  | 'email_matched_signin'
  | 'new_account_race'

type OAuthAccountConflictErrorInput = {
  provider: SocialProvider
  reason: OAuthAccountConflictReason
  context: OAuthAccountConflictContext
}

/**
 * Domain error for expected OAuth account ownership conflicts.
 *
 * The error intentionally carries only product-safe classification fields.
 * Provider user IDs, e-mail addresses, OAuth codes, state tokens, cookies, and
 * SecretWaifu user IDs stay out of the error object so callback logging and
 * redirect policy cannot accidentally leak them.
 */
class OAuthAccountConflictError extends Error {
  readonly code = 'OAUTH_ACCOUNT_CONFLICT'
  readonly provider: SocialProvider
  readonly reason: OAuthAccountConflictReason
  readonly context: OAuthAccountConflictContext

  constructor(input: OAuthAccountConflictErrorInput) {
    super('OAuth account conflict.')
    this.name = 'OAuthAccountConflictError'
    this.provider = input.provider
    this.reason = input.reason
    this.context = input.context
  }
}

const isOAuthAccountConflictReason = (value: unknown): value is OAuthAccountConflictReason =>
  value === 'provider_identity_belongs_to_other_user' ||
  value === 'user_already_has_different_provider_identity' ||
  value === 'duplicate_provider_identity_race'

const isOAuthAccountConflictContext = (value: unknown): value is OAuthAccountConflictContext =>
  value === 'authenticated_link' ||
  value === 'email_matched_signin' ||
  value === 'new_account_race'

const isOAuthAccountConflictError = (error: unknown): error is OAuthAccountConflictError => {
  if (error instanceof OAuthAccountConflictError) {
    return true
  }

  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as {
    code?: unknown
    provider?: unknown
    reason?: unknown
    context?: unknown
  }

  return (
    candidate.code === 'OAUTH_ACCOUNT_CONFLICT' &&
    typeof candidate.provider === 'string' &&
    isOAuthAccountConflictReason(candidate.reason) &&
    isOAuthAccountConflictContext(candidate.context)
  )
}

export {
  OAuthAccountConflictError,
  isOAuthAccountConflictError
}
export type {
  OAuthAccountConflictContext,
  OAuthAccountConflictReason
}
