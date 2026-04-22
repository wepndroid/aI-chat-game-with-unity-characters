/**
 * Shared helpers for building the Unity WebGL embed URL and parsing /play-demo query params.
 * Keep in sync with character → play flows that append ?characterId=&character=&storyId=.
 */

export type WebglPlayContext = {
  characterId: string | null
  characterSlug: string | null
  storyId: string | null
}

/**
 * Appends character context from /play-demo?characterId=&character= (slug) onto the Unity embed URL
 * so the WebGL build can read the same query string (legacy flow used ?character= for lookups).
 */
export const buildWebglEmbedUrlWithCharacterContext = (
  baseUrl: string,
  characterId: string | null,
  characterSlug: string | null,
  storyId: string | null
) => {
  try {
    const url = new URL(baseUrl)
    if (characterId) {
      url.searchParams.set('characterId', characterId)
    }
    if (characterSlug) {
      url.searchParams.set('character', characterSlug)
    }
    if (storyId) {
      url.searchParams.set('storyId', storyId)
    }
    return url.toString()
  } catch {
    return baseUrl
  }
}

/**
 * Parses WebGL routing context from an in-app href (e.g. `/play-demo?characterId=…`).
 */
export const parseWebglPlayContextFromHref = (href: string): WebglPlayContext | null => {
  try {
    const url = href.startsWith('http://') || href.startsWith('https://') ? new URL(href) : new URL(href, 'https://secretwaifu.local')
    if (!url.pathname.replace(/\/$/, '').endsWith('/play-demo')) {
      return null
    }
    return {
      characterId: url.searchParams.get('characterId'),
      characterSlug: url.searchParams.get('character'),
      storyId: url.searchParams.get('storyId')
    }
  } catch {
    return null
  }
}
