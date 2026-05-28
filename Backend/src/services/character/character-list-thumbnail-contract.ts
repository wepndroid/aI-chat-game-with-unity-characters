export type CharacterListThumbnailSource = 'card' | 'reference'

export type CharacterListThumbnailContractInput = {
  previewImageUrl: string | null
  thumbnailReferenceImageUrl: string | null
  cardThumbnailDesktopUrl: string | null
  cardThumbnailMobileUrl: string | null
}

export type CharacterListThumbnailContract = CharacterListThumbnailContractInput & {
  thumbnailUrl: string | null
}

/**
 * Owns the character-list image response contract.
 *
 * The web API exposes both stored card thumbnail fields, while card rendering
 * intentionally chooses one URL client-side to avoid double image loading.
 * Unity clients use the separate `thumbnailUrl` projection and must keep their
 * existing mobile, desktop, preview fallback order.
 */
export const resolveCharacterListThumbnailContract = (
  character: CharacterListThumbnailContractInput,
  thumbnailSource: CharacterListThumbnailSource
): CharacterListThumbnailContract => {
  const referenceImageUrl = character.thumbnailReferenceImageUrl ?? character.previewImageUrl

  if (thumbnailSource === 'reference') {
    return {
      previewImageUrl: referenceImageUrl,
      thumbnailReferenceImageUrl: referenceImageUrl,
      cardThumbnailDesktopUrl: referenceImageUrl,
      cardThumbnailMobileUrl: referenceImageUrl,
      thumbnailUrl: referenceImageUrl
    }
  }

  return {
    previewImageUrl: character.previewImageUrl,
    thumbnailReferenceImageUrl: null,
    cardThumbnailDesktopUrl: character.cardThumbnailDesktopUrl,
    cardThumbnailMobileUrl: character.cardThumbnailMobileUrl,
    thumbnailUrl: character.cardThumbnailMobileUrl ?? character.cardThumbnailDesktopUrl ?? character.previewImageUrl
  }
}
