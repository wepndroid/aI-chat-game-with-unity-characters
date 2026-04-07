import type { Character, CharacterCard } from '@prisma/client'

type CharacterPersonaPick = Pick<
  Character,
  'fullName' | 'description' | 'personality' | 'scenario' | 'firstMessage' | 'exampleDialogs'
>

type CharacterCardPersonaPick = Pick<
  CharacterCard,
  'id' | 'fullName' | 'description' | 'personality' | 'scenario' | 'firstMessage' | 'exampleDialogs' | 'isPublic'
>

/**
 * PDF: persona lives on CharacterCard when present; falls back to legacy Character columns.
 */
export const resolvePersonaFields = (
  character: CharacterPersonaPick,
  card: CharacterCardPersonaPick | null
): CharacterPersonaPick & { characterCardId: string | null; characterCardIsPublic: boolean | null } => {
  if (!card) {
    return {
      fullName: character.fullName,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      firstMessage: character.firstMessage,
      exampleDialogs: character.exampleDialogs,
      characterCardId: null,
      characterCardIsPublic: null
    }
  }

  return {
    fullName: card.fullName ?? character.fullName,
    description: card.description ?? character.description,
    personality: card.personality ?? character.personality,
    scenario: card.scenario ?? character.scenario,
    firstMessage: card.firstMessage ?? character.firstMessage,
    exampleDialogs: card.exampleDialogs ?? character.exampleDialogs,
    characterCardId: card.id,
    characterCardIsPublic: card.isPublic
  }
}
