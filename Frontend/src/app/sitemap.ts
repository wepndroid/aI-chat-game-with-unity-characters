import type { MetadataRoute } from 'next'
import { listCharacters } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 3600

const loadCharacterSitemapRoutes = async (): Promise<MetadataRoute.Sitemap> => {
  const characterRoutes: MetadataRoute.Sitemap = []
  let cursor: string | null = null

  do {
    const payload = await listCharacters({
      galleryScope: 'all',
      sort: 'newest',
      limit: 200,
      cursor
    })

    characterRoutes.push(
      ...payload.data
        .filter((character) => character.status === 'APPROVED' && character.visibility === 'PUBLIC')
        .map((character) => ({
          url: absoluteUrl(`/ai-girlfriends/${buildAiGirlfriendRouteKey(character.name, character.id)}`),
          lastModified: new Date(character.updatedAt),
          changeFrequency: 'weekly' as const,
          priority: 0.6
        }))
    )

    cursor = payload.page?.nextCursor ?? null
  } while (cursor)

  return characterRoutes
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: absoluteUrl('/ai-girlfriends'),
      changeFrequency: 'daily',
      priority: 0.9
    },
    {
      url: absoluteUrl('/download'),
      changeFrequency: 'weekly',
      priority: 0.8
    }
  ]

  try {
    const characterRoutes = await loadCharacterSitemapRoutes()
    return [...staticRoutes, ...characterRoutes]
  } catch {
    return staticRoutes
  }
}
