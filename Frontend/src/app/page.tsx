import type { Metadata } from 'next'
import { Suspense } from 'react'
import HomePage from '@/components/home/home-page'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { formatCompactCount } from '@/lib/format-compact-count'
import { getDefaultHomepage } from '@/lib/landing-page-api'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 30

type HomeCharacterCardData = {
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

type HomepageSelection = {
  landingPageKey: string
  landingPageName: string
  variantKey: string
  variantName: string
  heroVariant: 'default' | 'ahri'
}

const popularGradientClasses = ['from-[#5b0f0f] to-[#1e0707]', 'from-[#8f7040] to-[#2c1f09]', 'from-[#1d1b32] to-[#0a0911]', 'from-[#5a1212] to-[#210606]']

const toPopularCharacterCardData = (characterList: CharacterListRecord[]): HomeCharacterCardData[] => {
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

const resolveHomepageSelection = async (): Promise<HomepageSelection> => {
  try {
    const payload = await getDefaultHomepage()
    const landingPage = payload.data.landingPage
    const selectedKey = landingPage?.isActive ? landingPage.key : payload.data.fallbackKey
    const selectedPath = landingPage?.isActive ? landingPage.basePath : payload.data.fallbackPath

    if (selectedKey === 'home2' || selectedPath === '/home2') {
      return {
        landingPageKey: 'home2',
        landingPageName: landingPage?.name ?? 'Homepage Variant 2',
        variantKey: 'default',
        variantName: 'Default Route',
        heroVariant: 'ahri'
      }
    }

    return {
      landingPageKey: landingPage?.key ?? 'home1',
      landingPageName: landingPage?.name ?? 'Homepage Variant 1',
      variantKey: 'default',
      variantName: 'Default Route',
      heroVariant: 'default'
    }
  } catch {
    return {
      landingPageKey: 'home2',
      landingPageName: 'Homepage Variant 2',
      variantKey: 'default',
      variantName: 'Default Route',
      heroVariant: 'ahri'
    }
  }
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
      canonical: '/'
    },
    openGraph: {
      title: brandedTitle,
      description,
      url: absoluteUrl('/'),
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

const RootPage = async () => {
  let initialPopularCharacters: HomeCharacterCardData[] = []
  const homepageSelection = await resolveHomepageSelection()

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
        defaultLandingPageKey={homepageSelection.landingPageKey}
        defaultLandingPageName={homepageSelection.landingPageName}
        defaultVariantKey={homepageSelection.variantKey}
        defaultVariantName={homepageSelection.variantName}
        heroVariant={homepageSelection.heroVariant}
      />
    </Suspense>
  )
}

export default RootPage
