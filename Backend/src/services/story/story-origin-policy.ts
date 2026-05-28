import type { StoryOrigin, UserRole } from '@prisma/client'

/**
 * Captures story origin at write time. This is intentionally not inferred from
 * the author's current role at read time, because admin role changes and manual
 * curation must not rewrite story history implicitly.
 */
const resolveStoryOriginForAuthor = (role: UserRole): StoryOrigin => {
  return role === 'ADMIN' ? 'OFFICIAL' : 'COMMUNITY'
}

export { resolveStoryOriginForAuthor }
