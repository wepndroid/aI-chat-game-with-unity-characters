import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveStartChatHref,
  resolveStartChatInterception
} from './character-action-state'

const verifiedUser = {
  id: 'user-1',
  isEmailVerified: true
}

const unverifiedUser = {
  id: 'user-1',
  isEmailVerified: false
}

const canStartChatAccess = {
  can_start_chat: true,
  start_chat_requires_verified_email: false,
  start_chat_unavailable_reason: null
} as const

test('resolveStartChatHref sends guests to signup and verified users with a story to story-scoped play', () => {
  assert.equal(resolveStartChatHref(null, canStartChatAccess, 'story-1'), 'https://secretwaifu.com/?openSignUp=1')
  assert.equal(resolveStartChatHref(verifiedUser, canStartChatAccess, 'story-1'), '/play?launchStoryId=story-1')
})

test('resolveStartChatInterception opens verification prompt for unverified users', () => {
  assert.deepEqual(
    resolveStartChatInterception(unverifiedUser, canStartChatAccess, 'story-1'),
    { action: 'email-verification' }
  )
})

test('resolveStartChatInterception does not show no-story when a concrete story id is available', () => {
  const staleNoStoryAccess = {
    can_start_chat: false,
    start_chat_requires_verified_email: false,
    start_chat_unavailable_reason: 'NO_PLAYABLE_STORY'
  } as const

  assert.equal(resolveStartChatHref(verifiedUser, staleNoStoryAccess, 'story-1'), '/play?launchStoryId=story-1')
  assert.equal(resolveStartChatInterception(verifiedUser, staleNoStoryAccess, 'story-1'), null)
  assert.deepEqual(
    resolveStartChatInterception(verifiedUser, staleNoStoryAccess, null),
    { action: 'missing-story' }
  )
})

test('resolveStartChatHref sends free-tier users to membership without intercepting the click', () => {
  const membershipRequiredAccess = {
    can_start_chat: false,
    start_chat_requires_verified_email: false,
    start_chat_unavailable_reason: 'MEMBERSHIP_REQUIRED'
  } as const

  assert.equal(resolveStartChatHref(verifiedUser, membershipRequiredAccess, 'story-1'), '/members')
  assert.equal(resolveStartChatInterception(verifiedUser, membershipRequiredAccess, 'story-1'), null)
})
