import type { Character, CharacterCard } from '@prisma/client'

type CharacterVisualPick = Pick<
  Character,
  'fullName' | 'description'
>

type CharacterCardPersonaPick = Pick<
  CharacterCard,
  'id' | 'fullName' | 'description' | 'personality' | 'scenario' | 'firstMessage' | 'exampleDialogs' | 'isPublic'
>

/**
 * Phase-1 strict mode: persona fields are sourced from CharacterCard only.
 * Character columns remain visual metadata and legacy compatibility only.
 */
export const resolvePersonaFields = (
  character: CharacterVisualPick,
  card: CharacterCardPersonaPick | null
): {
  fullName: string | null
  description: string | null
  personality: string | null
  scenario: string | null
  firstMessage: string | null
  exampleDialogs: string | null
  characterCardId: string | null
  characterCardIsPublic: boolean | null
} => {
  if (!card) {
    return {
      fullName: character.fullName,
      description: character.description,
      personality: null,
      scenario: null,
      firstMessage: null,
      exampleDialogs: null,
      characterCardId: null,
      characterCardIsPublic: null
    }
  }

  return {
    fullName: card.fullName ?? character.fullName,
    description: card.description ?? character.description,
    personality: card.personality ?? null,
    scenario: card.scenario ?? null,
    firstMessage: card.firstMessage ?? null,
    exampleDialogs: card.exampleDialogs ?? null,
    characterCardId: card.id,
    characterCardIsPublic: card.isPublic
  }
}
