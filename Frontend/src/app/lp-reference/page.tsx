import type { Metadata } from 'next'
import { Suspense } from 'react'
import HomePage from '@/components/home/home-page'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { formatCompactCount } from '@/lib/format-compact-count'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 30

type ReferenceLandingCharacterCardData = {
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

const toReferenceCharacterCardData = (characterList: CharacterListRecord[]): ReferenceLandingCharacterCardData[] => {
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
      previewImageUrl: character.thumbnailReferenceImageUrl ?? character.previewImageUrl,
      cardThumbnailDesktopUrl: character.cardThumbnailDesktopUrl,
      cardThumbnailMobileUrl: character.cardThumbnailMobileUrl
    }))
}

export async function generateMetadata(): Promise<Metadata> {
  const brandedTitle = 'AI Anime Girlfriends With Original Reference Art | SecretWaifu.com'
  const description =
    'Browse SecretWaifu characters using their original reference artwork, then start a chat in browser, Windows, or PCVR.'

  return {
    title: {
      absolute: brandedTitle
    },
    description,
    alternates: {
      canonical: '/lp-reference'
    },
    openGraph: {
      title: brandedTitle,
      description,
      url: absoluteUrl('/lp-reference'),
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

const ReferenceLandingPage = async () => {
  let initialPopularCharacters: ReferenceLandingCharacterCardData[] = []

  try {
    const payload = await listCharacters({
      galleryScope: 'all',
      sort: 'popular',
      limit: 32,
      thumbnailSource: 'reference'
    })

    initialPopularCharacters = toReferenceCharacterCardData(payload.data)
  } catch {
    initialPopularCharacters = []
  }

  return (
    <Suspense fallback={null}>
      <HomePage
        initialPopularCharacters={initialPopularCharacters}
        defaultLandingPageKey="lp-reference"
        defaultLandingPageName="Reference Thumbnail Landing Page"
        defaultVariantKey="reference-thumbnails"
        defaultVariantName="Reference Thumbnails"
        popularSectionTitle="AI Girlfriends From Reference Art"
        popularThumbnailSource="reference"
      />
    </Suspense>
  )
}

export default ReferenceLandingPage
