import type { Metadata } from 'next'
import { Suspense } from 'react'
import HomePage from '@/components/home/home-page'
import { listCharacters, type CharacterListRecord } from '@/lib/character-api'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 300

type HomeCharacterCardData = {
  id: string
  slug: string
  name: string
  likes: string
  chats: string
  gradientClassName: string
  tagline?: string
  description?: string
  previewImageUrl?: string | null
  isPatreonGated: boolean
  minimumTierCents: number | null
}

const topRatedGradientClasses = ['from-[#5b0f0f] to-[#1e0707]', 'from-[#8f7040] to-[#2c1f09]', 'from-[#1d1b32] to-[#0a0911]', 'from-[#5a1212] to-[#210606]']

const formatHeartsCount = (count: number) => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }

  return String(count)
}

const toTopRatedCharacterCardData = (characterList: CharacterListRecord[]): HomeCharacterCardData[] => {
  return characterList
    .filter((character) => character.status === 'APPROVED')
    .slice(0, 16)
    .map((character, index) => ({
      id: character.id,
      slug: character.slug,
      name: character.name,
      likes: formatHeartsCount(character.heartsCount),
      chats: formatHeartsCount(character.viewsCount),
      gradientClassName: topRatedGradientClasses[index % topRatedGradientClasses.length],
      tagline: character.tagline ?? undefined,
      description: character.description ?? undefined,
      previewImageUrl: character.previewImageUrl,
      isPatreonGated: character.isPatreonGated,
      minimumTierCents: character.minimumTierCents
    }))
}

export async function generateMetadata(): Promise<Metadata> {
  const title = 'AI Anime Girlfriend Experience'
  const brandedTitle = 'AI Anime Girlfriend Experience | SecretWaifu.com'
  const description =
    'Step into a living digital sanctuary where you can chat with hand-crafted VRoid AI girlfriends, use voice or speech-to-text, customize personalities, and explore VR support.'

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
  let initialTopRatedCharacters: HomeCharacterCardData[] = []

  try {
    const payload = await listCharacters({
      galleryScope: 'all',
      sort: 'hearts',
      limit: 32
    })

    initialTopRatedCharacters = toTopRatedCharacterCardData(payload.data)
  } catch {
    initialTopRatedCharacters = []
  }

  return (
    <Suspense fallback={null}>
      <HomePage initialTopRatedCharacters={initialTopRatedCharacters} />
    </Suspense>
  )
}

export default RootPage
