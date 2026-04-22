import type { MetadataRoute } from 'next'
import { listCharacters } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 3600

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
    const payload = await listCharacters({
      galleryScope: 'all',
      sort: 'newest',
      limit: 1000
    })

    const characterRoutes: MetadataRoute.Sitemap = payload.data
      .filter((character) => character.status === 'APPROVED' && character.visibility === 'PUBLIC')
      .map((character) => ({
        url: absoluteUrl(`/ai-girlfriends/${buildAiGirlfriendRouteKey(character.name, character.id)}`),
        lastModified: new Date(character.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.6
      }))

    return [...staticRoutes, ...characterRoutes]
  } catch {
    return staticRoutes
  }
}
