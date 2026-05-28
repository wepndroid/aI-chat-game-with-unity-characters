import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCharacterAccess } from './character-access-policy'

const approvedPatreonCharacter = {
  id: 'character-1',
  ownerId: 'owner-1',
  status: 'APPROVED' as const,
  visibility: 'PUBLIC' as const,
  isPatreonGated: true
}

const verifiedUser = {
  userId: 'user-1',
  role: 'USER' as const,
  isEmailVerified: true
}

const unverifiedUser = {
  ...verifiedUser,
  isEmailVerified: false
}

test('resolveCharacterAccess keeps approved public characters readable for anonymous visitors', () => {
  const access = resolveCharacterAccess(null, approvedPatreonCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })

  assert.equal(access.canListCharacter, true)
  assert.equal(access.canReadCharacter, true)
  assert.equal(access.canStartChat, false)
  assert.equal(access.canPreviewModel, false)
})

test('resolveCharacterAccess hides approved private characters from everyone except owner and admins', () => {
  const privateCharacter = {
    ...approvedPatreonCharacter,
    visibility: 'PRIVATE' as const
  }

  const anonymousAccess = resolveCharacterAccess(null, privateCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })
  const otherUserAccess = resolveCharacterAccess(verifiedUser, privateCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })
  const ownerAccess = resolveCharacterAccess({ ...verifiedUser, userId: privateCharacter.ownerId }, privateCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })

  assert.equal(anonymousAccess.canReadCharacter, false)
  assert.equal(otherUserAccess.canReadCharacter, false)
  assert.equal(ownerAccess.canReadCharacter, true)
  assert.equal(ownerAccess.canStartChat, true)
  assert.equal(ownerAccess.canPreviewModel, true)
})

test('resolveCharacterAccess makes approved hidden characters visible to logged-in users only', () => {
  const hiddenCharacter = {
    ...approvedPatreonCharacter,
    visibility: 'UNLISTED' as const
  }

  const anonymousAccess = resolveCharacterAccess(null, hiddenCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })
  const signedInAccess = resolveCharacterAccess(verifiedUser, hiddenCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })

  assert.equal(anonymousAccess.canReadCharacter, false)
  assert.equal(signedInAccess.canReadCharacter, true)
  assert.equal(signedInAccess.canStartChat, true)
  assert.equal(signedInAccess.canPreviewModel, true)
})

test('resolveCharacterAccess allows verified users to start chat and preview gated approved characters', () => {
  const access = resolveCharacterAccess(verifiedUser, approvedPatreonCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })

  assert.equal(access.canReadCharacter, true)
  assert.equal(access.canStartChat, true)
  assert.equal(access.canPreviewModel, true)
})

test('resolveCharacterAccess blocks free-tier game chat without hiding the character or 3D preview', () => {
  const access = resolveCharacterAccess(verifiedUser, approvedPatreonCharacter, {
    hasPlayableStory: true,
    hasModel: true,
    canAccessGame: false
  })

  assert.equal(access.canReadCharacter, true)
  assert.equal(access.canStartChat, false)
  assert.equal(access.startChatUnavailableReason, 'MEMBERSHIP_REQUIRED')
  assert.equal(access.canPreviewModel, true)
})

test('resolveCharacterAccess blocks unverified users from start chat and 3D preview without hiding the character', () => {
  const access = resolveCharacterAccess(unverifiedUser, approvedPatreonCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })

  assert.equal(access.canReadCharacter, true)
  assert.equal(access.canStartChat, false)
  assert.equal(access.startChatRequiresVerifiedEmail, true)
  assert.equal(access.canPreviewModel, false)
  assert.equal(access.previewModelRequiresVerifiedEmail, true)
})

test('resolveCharacterAccess treats official approved characters the same as community approved characters', () => {
  const officialCharacter = {
    ...approvedPatreonCharacter,
    ownerId: 'admin-owner'
  }

  const access = resolveCharacterAccess(verifiedUser, officialCharacter, {
    hasPlayableStory: true,
    hasModel: true
  })

  assert.equal(access.canStartChat, true)
  assert.equal(access.canPreviewModel, true)
})

test('resolveCharacterAccess requires playable story and model capabilities separately', () => {
  const access = resolveCharacterAccess(verifiedUser, approvedPatreonCharacter, {
    hasPlayableStory: false,
    hasModel: false
  })

  assert.equal(access.canReadCharacter, true)
  assert.equal(access.canStartChat, false)
  assert.equal(access.canPreviewModel, false)
  assert.equal(access.startChatUnavailableReason, 'NO_PLAYABLE_STORY')
  assert.equal(access.previewModelUnavailableReason, 'NO_MODEL')
})
