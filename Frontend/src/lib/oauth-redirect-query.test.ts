import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE,
  buildOAuthRedirectCleanPath,
  getAuthenticatedOAuthLinkErrorMessage,
  getUnauthenticatedOAuthErrorMessage
} from './oauth-redirect-query'

test('getAuthenticatedOAuthLinkErrorMessage maps provider conflict links to stable logged-in copy', () => {
  const params = new URLSearchParams('oauth=link_error&oauth_error=provider_account_conflict&provider=google&message=unsafe')

  assert.equal(getAuthenticatedOAuthLinkErrorMessage(params), AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE)
})

test('getAuthenticatedOAuthLinkErrorMessage ignores generic unauthenticated OAuth errors', () => {
  const params = new URLSearchParams('oauth=error&oauth_error=oauth_signin_failed&provider=google')

  assert.equal(getAuthenticatedOAuthLinkErrorMessage(params), null)
})

test('getUnauthenticatedOAuthErrorMessage prefers machine-readable OAuth error codes over human message parsing', () => {
  const params = new URLSearchParams('oauth=error&oauth_error=provider_account_conflict&message=This account exists')

  assert.equal(getUnauthenticatedOAuthErrorMessage(params), 'OAuth sign-in failed.')
})

test('buildOAuthRedirectCleanPath strips OAuth redirect metadata without removing unrelated query state', () => {
  const url = new URL('https://secretwaifu.example/profile?oauth=link_error&oauth_error=provider_account_conflict&provider=google&message=conflict&setPassword=1&newUser=0&foo=keep#account')

  assert.equal(buildOAuthRedirectCleanPath(url), '/profile?foo=keep#account')
})
