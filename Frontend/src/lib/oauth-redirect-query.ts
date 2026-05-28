const AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE =
  'This SecretWaifu account is already linked to a different Google account. Sign out and use the linked Google account, or contact support if you need the link changed.'

const OAUTH_REDIRECT_QUERY_KEYS = [
  'oauth',
  'oauth_error',
  'message',
  'provider',
  'newUser',
  'setPassword'
] as const

const stripOAuthRedirectQueryParams = (searchParams: URLSearchParams) => {
  for (const key of OAUTH_REDIRECT_QUERY_KEYS) {
    searchParams.delete(key)
  }
}

const normalizeLegacyOAuthErrorMessage = (rawMessage: string | null) => {
  if (!rawMessage) {
    return 'Google sign-in did not complete. Please try again.'
  }

  const normalized = rawMessage.trim().toLowerCase()

  if (normalized.includes('state') || normalized.includes('expired')) {
    return 'Google sign-in session expired. Please try again.'
  }

  if (normalized.includes('not completed') || normalized.includes('missing oauth callback code')) {
    return 'Google sign-in was canceled or incomplete. Please try again.'
  }

  if (normalized.includes('not available') || normalized.includes('not enabled')) {
    return 'Google sign-in is temporarily unavailable. Please contact support.'
  }

  return rawMessage
}

const getAuthenticatedOAuthLinkErrorMessage = (searchParams: URLSearchParams) => {
  if (
    searchParams.get('oauth') !== 'link_error' ||
    searchParams.get('oauth_error') !== 'provider_account_conflict' ||
    searchParams.get('provider') !== 'google'
  ) {
    return null
  }

  return AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE
}

const getUnauthenticatedOAuthErrorMessage = (searchParams: URLSearchParams) => {
  if (searchParams.get('oauth') !== 'error') {
    return null
  }

  const oauthErrorCode = searchParams.get('oauth_error')

  if (oauthErrorCode === 'oauth_signin_failed' || oauthErrorCode === 'provider_account_conflict') {
    return 'OAuth sign-in failed.'
  }

  return normalizeLegacyOAuthErrorMessage(searchParams.get('message'))
}

const buildOAuthRedirectCleanPath = (url: URL) => {
  const nextUrl = new URL(url.toString())
  stripOAuthRedirectQueryParams(nextUrl.searchParams)

  const query = nextUrl.searchParams.toString()
  return query ? `${nextUrl.pathname}?${query}${nextUrl.hash}` : `${nextUrl.pathname}${nextUrl.hash}`
}

export {
  AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE,
  buildOAuthRedirectCleanPath,
  getAuthenticatedOAuthLinkErrorMessage,
  getUnauthenticatedOAuthErrorMessage,
  stripOAuthRedirectQueryParams
}
