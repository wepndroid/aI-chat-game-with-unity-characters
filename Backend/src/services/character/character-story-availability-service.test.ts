import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCharacterStoryAvailability } from './character-story-availability-service'

test('resolveCharacterStoryAvailability returns the persisted default when it is playable', async () => {
  const characterFindCalls: unknown[] = []
  const countCalls: unknown[] = []
  const prismaClient = {
    character: {
      findUnique: async (args: unknown) => {
        characterFindCalls.push(args)
        return {
          defaultStoryId: 'story-default',
          defaultStory: {
            id: 'story-default',
            characterId: 'character-1',
            publicationStatus: 'PUBLISHED' as const,
            moderationStatus: 'APPROVED' as const
          }
        }
      }
    },
    storyPost: {
      count: async (args: unknown) => {
        countCalls.push(args)
        return 2
      },
      findFirst: async () => null
    }
  }

  const availability = await resolveCharacterStoryAvailability('character-1', { prismaClient })

  assert.deepEqual(availability, {
    hasPlayableStory: true,
    defaultStoryId: 'story-default'
  })
  assert.deepEqual(characterFindCalls, [
    {
      where: {
        id: 'character-1'
      },
      select: {
        defaultStoryId: true,
        defaultStory: {
          select: {
            id: true,
            characterId: true,
            publicationStatus: true,
            moderationStatus: true
          }
        }
      }
    }
  ])
  assert.deepEqual(countCalls, [
    {
      where: {
        characterId: 'character-1',
        publicationStatus: 'PUBLISHED',
        moderationStatus: 'APPROVED'
      }
    }
  ])
})

test('resolveCharacterStoryAvailability returns no default when a character has no playable story', async () => {
  const prismaClient = {
    character: {
      findUnique: async () => ({
        defaultStoryId: null,
        defaultStory: null
      })
    },
    storyPost: {
      count: async () => 0,
      findFirst: async () => null
    }
  }

  const availability = await resolveCharacterStoryAvailability('character-without-stories', { prismaClient })

  assert.deepEqual(availability, {
    hasPlayableStory: false,
    defaultStoryId: null
  })
})
