import type { Metadata } from 'next'
import { Suspense } from 'react'
import HomePage from '@/components/home/home-page'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { formatCompactCount } from '@/lib/format-compact-count'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 30

type Home2CharacterCardData = {
  id: string
  slug: string
  name: string
  likes: string
  messages: string
  gradientClassName: string
  tagline?: string
  description?: string
  previewImageUrl?: string | null
  cardThumbnailDesktopUrl?: string | null
  cardThumbnailMobileUrl?: string | null
}

const popularGradientClasses = ['from-[#5b0f0f] to-[#1e0707]', 'from-[#8f7040] to-[#2c1f09]', 'from-[#1d1b32] to-[#0a0911]', 'from-[#5a1212] to-[#210606]']

const toPopularCharacterCardData = (characterList: CharacterListRecord[]): Home2CharacterCardData[] => {
  return characterList
    .filter((character) => character.status === 'APPROVED')
    .slice(0, 16)
    .map((character, index) => ({
      id: character.id,
      slug: character.slug,
      name: character.name,
      likes: formatCompactCount(character.heartsCount),
      messages: formatCompactCount(character.messageCount),
      gradientClassName: popularGradientClasses[index % popularGradientClasses.length],
      tagline: character.tagline ?? undefined,
      description: character.description ?? undefined,
      previewImageUrl: character.previewImageUrl,
      cardThumbnailDesktopUrl: character.cardThumbnailDesktopUrl,
      cardThumbnailMobileUrl: character.cardThumbnailMobileUrl
    }))
}

export async function generateMetadata(): Promise<Metadata> {
  const brandedTitle = 'AI Girlfriend Game Experience | SecretWaifu.com'
  const description =
    'A cinematic AI girlfriend experience with hand-crafted VRoid AI girlfriends, completely uncensored. Your very own NSFW AI girlfriend, with VR support included!'

  return {
    title: {
      absolute: brandedTitle
    },
    description,
    alternates: {
      canonical: '/home2'
    },
    robots: {
      index: false,
      follow: false
    },
    openGraph: {
      title: brandedTitle,
      description,
      url: absoluteUrl('/home2'),
      images: ['/images/Homepage.png']
    },
    twitter: {
      card: 'summary_large_image',
      title: brandedTitle,
      description,
      images: ['/images/Homepage.png']
    }
  }
}

const Home2Page = async () => {
  let initialPopularCharacters: Home2CharacterCardData[] = []

  try {
    const payload = await listCharacters({
      galleryScope: 'all',
      sort: 'popular',
      limit: 32
    })

    initialPopularCharacters = toPopularCharacterCardData(payload.data)
  } catch {
    initialPopularCharacters = []
  }

  return (
    <Suspense fallback={null}>
      <HomePage
        initialPopularCharacters={initialPopularCharacters}
        defaultLandingPageKey="home2"
        defaultLandingPageName="Homepage Variant 2"
        defaultVariantKey="default"
        defaultVariantName="Default Route"
        heroVariant="ahri"
      />
    </Suspense>
  )
}

export default Home2Page
