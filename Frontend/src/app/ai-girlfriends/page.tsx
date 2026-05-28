import type { Metadata } from 'next'
import CharactersPage from '@/components/characters/characters-page'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 30

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Browse AI Girlfriends'
  const description =
    "Browse SecretWaifu's public AI girlfriend gallery, compare personalities and stories, and open the profiles that fit your next chat."

  return {
    title,
    description,
    alternates: {
      canonical: '/ai-girlfriends'
    },
    openGraph: {
      title: `${title} | SecretWaifu.com`,
      description,
      url: absoluteUrl('/ai-girlfriends'),
      images: ['/images/Character-page.png']
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SecretWaifu.com`,
      description,
      images: ['/images/Character-page.png']
    }
  }
}

const AiGirlfriendsPage = async () => {
  let initialCharacterList: CharacterListRecord[] = []

  try {
    const payload = await listCharacters({
      galleryScope: 'all',
      sort: 'newest',
      limit: 72
    })

    initialCharacterList = payload.data
  } catch {
    initialCharacterList = []
  }

  return <CharactersPage initialCharacterList={initialCharacterList} />
}

export default AiGirlfriendsPage
