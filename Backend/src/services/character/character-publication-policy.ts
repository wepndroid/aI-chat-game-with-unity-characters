type CharacterPublicationActorRole = 'ADMIN' | 'USER' | 'CREATOR'
type CharacterPublicationOwnerRole = 'ADMIN' | 'USER' | 'CREATOR'
type CharacterPublicationVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
type CharacterPublicationStatus = 'DRAFT' | 'PENDING' | 'APPROVED'

type CharacterPublicationIntent = 'draft' | 'publish'

type CharacterPublicationPolicyError = {
  ok: false
  statusCode: 400 | 403
  code:
    | 'ADMIN_PUBLICATION_INTENT_REQUIRED'
    | 'PUBLICATION_INTENT_FORBIDDEN'
    | 'COMMUNITY_PUBLICATION_INTENT_FORBIDDEN'
  message: string
}

type CharacterCreatePublicationDecision = {
  ok: true
  status: CharacterPublicationStatus
  publishedAt: Date | null
  requiresDefaultStory: boolean
}

type CharacterUpdatePublicationDecision = {
  ok: true
  status?: 'DRAFT' | 'APPROVED'
  publishedAt?: Date | null
  clearsModerationRejectReason: boolean
  requiresDefaultStory: boolean
}

type CharacterCreatePublicationInput = {
  actorRole: CharacterPublicationActorRole
  visibility: CharacterPublicationVisibility
  publicationIntent?: CharacterPublicationIntent
  now: Date
}

type CharacterUpdatePublicationInput = {
  actorRole: CharacterPublicationActorRole
  characterOwnerRole: CharacterPublicationOwnerRole
  existingPublishedAt: Date | null
  publicationIntent?: CharacterPublicationIntent
  now: Date
}

const nonAdminPublicationIntentError: CharacterPublicationPolicyError = {
  ok: false,
  statusCode: 403,
  code: 'PUBLICATION_INTENT_FORBIDDEN',
  message: 'Only admins can set character publication intent.'
}

/**
 * Resolves the initial publication state for a character create command.
 *
 * Admin-owned official characters must choose between draft and publish explicitly so a generic
 * content save cannot silently publish. Community creators keep the legacy review behavior:
 * private characters are immediately usable by their owner, while shared rows enter moderation.
 */
const resolveCharacterCreatePublication = (
  input: CharacterCreatePublicationInput
): CharacterCreatePublicationDecision | CharacterPublicationPolicyError => {
  if (input.actorRole !== 'ADMIN') {
    if (input.publicationIntent) {
      return nonAdminPublicationIntentError
    }

    if (input.visibility === 'PRIVATE') {
      return {
        ok: true,
        status: 'APPROVED',
        publishedAt: input.now,
        requiresDefaultStory: true
      }
    }

    return {
      ok: true,
      status: 'PENDING',
      publishedAt: null,
      requiresDefaultStory: false
    }
  }

  if (!input.publicationIntent) {
    return {
      ok: false,
      statusCode: 400,
      code: 'ADMIN_PUBLICATION_INTENT_REQUIRED',
      message: 'Admin official character creates require publicationIntent.'
    }
  }

  if (input.publicationIntent === 'draft') {
    return {
      ok: true,
      status: 'DRAFT',
      publishedAt: null,
      requiresDefaultStory: false
    }
  }

  return {
    ok: true,
    status: 'APPROVED',
    publishedAt: input.now,
    requiresDefaultStory: true
  }
}

/**
 * Resolves explicit publication changes for character updates.
 *
 * This policy intentionally covers official publication only. Community moderation remains a
 * separate endpoint so admin content edits do not accidentally approve or reject submissions.
 */
const resolveCharacterUpdatePublication = (
  input: CharacterUpdatePublicationInput
): CharacterUpdatePublicationDecision | CharacterPublicationPolicyError => {
  if (!input.publicationIntent) {
    return {
      ok: true,
      status: undefined,
      publishedAt: undefined,
      clearsModerationRejectReason: false,
      requiresDefaultStory: false
    }
  }

  if (input.actorRole !== 'ADMIN') {
    return nonAdminPublicationIntentError
  }

  if (input.characterOwnerRole !== 'ADMIN') {
    return {
      ok: false,
      statusCode: 403,
      code: 'COMMUNITY_PUBLICATION_INTENT_FORBIDDEN',
      message: 'Community character moderation must use the moderation status endpoint.'
    }
  }

  if (input.publicationIntent === 'draft') {
    return {
      ok: true,
      status: 'DRAFT',
      publishedAt: null,
      clearsModerationRejectReason: true,
      requiresDefaultStory: false
    }
  }

  return {
    ok: true,
    status: 'APPROVED',
    publishedAt: input.existingPublishedAt ?? input.now,
    clearsModerationRejectReason: true,
    requiresDefaultStory: true
  }
}

export {
  resolveCharacterCreatePublication,
  resolveCharacterUpdatePublication
}
export type {
  CharacterCreatePublicationDecision,
  CharacterPublicationIntent,
  CharacterPublicationPolicyError,
  CharacterUpdatePublicationDecision
}
