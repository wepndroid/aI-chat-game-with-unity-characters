import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { isValidDefaultStoryForCharacter, type DefaultStoryCandidate } from './story-default-policy'

type StoryDefaultPrismaClient = Pick<Prisma.TransactionClient, 'character' | 'storyPost'>

type SetDefaultStoryResult =
  | { ok: true; defaultStoryId: string | null }
  | { ok: false; status: 400 | 404; message: string }

const defaultStorySelect = {
  id: true,
  characterId: true,
  publicationStatus: true,
  moderationStatus: true
} as const

const setCharacterDefaultStory = async (
  characterId: string,
  storyId: string,
  prismaClient: StoryDefaultPrismaClient = prisma
): Promise<SetDefaultStoryResult> => {
  const story = await prismaClient.storyPost.findUnique({
    where: { id: storyId },
    select: defaultStorySelect
  })

  if (!story) {
    return { ok: false, status: 404, message: 'Story not found.' }
  }

  if (!isValidDefaultStoryForCharacter(characterId, story as DefaultStoryCandidate)) {
    return {
      ok: false,
      status: 400,
      message: 'Default story must be an approved published story linked to this character.'
    }
  }

  await prismaClient.character.update({
    where: { id: characterId },
    data: { defaultStoryId: story.id },
    select: { id: true }
  })

  return { ok: true, defaultStoryId: story.id }
}

const clearCharacterDefaultStory = async (
  characterId: string,
  prismaClient: Pick<Prisma.TransactionClient, 'character'> = prisma
) => {
  await prismaClient.character.update({
    where: { id: characterId },
    data: { defaultStoryId: null },
    select: { id: true }
  })
}

const clearDefaultIfStoryBecameNonPlayable = async (
  storyId: string,
  prismaClient: Pick<Prisma.TransactionClient, 'character'> = prisma
) => {
  await prismaClient.character.updateMany({
    where: { defaultStoryId: storyId },
    data: { defaultStoryId: null }
  })
}

export {
  clearCharacterDefaultStory,
  clearDefaultIfStoryBecameNonPlayable,
  setCharacterDefaultStory
}
export type { SetDefaultStoryResult, StoryDefaultPrismaClient }
