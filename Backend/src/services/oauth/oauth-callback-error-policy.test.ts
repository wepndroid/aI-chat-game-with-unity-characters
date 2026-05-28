import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE,
  buildOAuthCallbackExpectedErrorRedirect
} from './oauth-callback-error-policy'
import { OAuthAccountConflictError } from './oauth-account-errors'

test('buildOAuthCallbackExpectedErrorRedirect maps authenticated provider conflicts to profile-local link errors', () => {
  const result = buildOAuthCallbackExpectedErrorRedirect({
    error: new OAuthAccountConflictError({
      provider: 'GOOGLE',
      reason: 'user_already_has_different_provider_identity',
      context: 'authenticated_link'
    }),
    providerKey: 'google',
    redirectAfter: '/profile?tab=identity',
    isAuthenticated: true
  })

  assert.ok(result)
  assert.equal(result.redirectPath, '/profile?tab=identity')
  assert.deepEqual(result.redirectParams, {
    oauth: 'link_error',
    oauth_error: 'provider_account_conflict',
    provider: 'google',
    message: AUTHENTICATED_OAUTH_ACCOUNT_CONFLICT_MESSAGE,
    openSignIn: undefined
  })
  assert.equal(result.runtimeLog.level, 'info')
  assert.deepEqual(result.runtimeLog.args, [
    '[oauth] Expected OAuth account conflict.',
    {
      authenticated: true,
      context: 'authenticated_link',
      provider: 'google',
      reason: 'user_already_has_different_provider_identity'
    }
  ])
})

test('buildOAuthCallbackExpectedErrorRedirect keeps unauthenticated provider conflicts generic', () => {
  const result = buildOAuthCallbackExpectedErrorRedirect({
    error: new OAuthAccountConflictError({
      provider: 'GOOGLE',
      reason: 'user_already_has_different_provider_identity',
      context: 'email_matched_signin'
    }),
    providerKey: 'google',
    redirectAfter: '/profile',
    isAuthenticated: false
  })

  assert.ok(result)
  assert.equal(result.redirectPath, '/')
  assert.deepEqual(result.redirectParams, {
    oauth: 'error',
    oauth_error: 'oauth_signin_failed',
    provider: 'google',
    message: 'OAuth sign-in failed.',
    openSignIn: '1'
  })
  assert.equal(result.runtimeLog.level, 'info')
  assert.deepEqual(result.runtimeLog.args, [
    '[oauth] Expected OAuth account conflict.',
    {
      authenticated: false,
      context: 'email_matched_signin',
      provider: 'google',
      reason: 'user_already_has_different_provider_identity'
    }
  ])
})

test('buildOAuthCallbackExpectedErrorRedirect does not handle unknown OAuth callback errors', () => {
  const result = buildOAuthCallbackExpectedErrorRedirect({
    error: new Error('provider outage'),
    providerKey: 'google',
    redirectAfter: '/profile',
    isAuthenticated: false
  })

  assert.equal(result, null)
})
