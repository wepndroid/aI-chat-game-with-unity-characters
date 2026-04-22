import type { Metadata } from 'next'
import CharacterPage from '@/components/character/character-page'
import { getCharacterDetail, type CharacterDetailRecord } from '@/lib/character-api'
import { extractAiGirlfriendIdFromRouteKey } from '@/lib/ai-girlfriend-route'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 300

type AiGirlfriendDetailPageProps = {
  params: Promise<{ id: string }>
}

const loadCharacterDetail = async (routeKey: string): Promise<CharacterDetailRecord | null> => {
  try {
    const payload = await getCharacterDetail(extractAiGirlfriendIdFromRouteKey(routeKey))
    return payload.data
  } catch {
    return null
  }
}

const buildAiGirlfriendMetadata = (characterRecord: CharacterDetailRecord, routeKey: string): Metadata => {
  const isIndexable = characterRecord.status === 'APPROVED' && characterRecord.visibility === 'PUBLIC'
  const description =
    characterRecord.tagline?.trim() ||
    characterRecord.description?.trim() ||
    `Meet ${characterRecord.name} in SecretWaifu's living digital sanctuary. Explore her personality, voice, and story-driven chat.`
  const title = `${characterRecord.name} | AI Girlfriend`
  const renderedTitle = `${title} | SecretWaifu.com`

  return {
    title,
    description,
    alternates: {
      canonical: `/ai-girlfriends/${routeKey}`
    },
    robots: isIndexable ? undefined : { index: false, follow: false },
    openGraph: {
      title: renderedTitle,
      description,
      url: absoluteUrl(`/ai-girlfriends/${routeKey}`),
      images: characterRecord.previewImageUrl ? [characterRecord.previewImageUrl] : ['/images/Character-page.png']
    },
    twitter: {
      card: 'summary_large_image',
      title: renderedTitle,
      description,
      images: characterRecord.previewImageUrl ? [characterRecord.previewImageUrl] : ['/images/Character-page.png']
    }
  }
}

export async function generateMetadata({ params }: AiGirlfriendDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params
  const characterRecord = await loadCharacterDetail(resolvedParams.id)

  if (!characterRecord) {
    return {
      title: 'AI Girlfriend Not Found',
      robots: {
        index: false,
        follow: false
      }
    }
  }

  return buildAiGirlfriendMetadata(characterRecord, resolvedParams.id)
}

const AiGirlfriendDetailPage = async ({ params }: AiGirlfriendDetailPageProps) => {
  const resolvedParams = await params
  const characterRecord = await loadCharacterDetail(resolvedParams.id)

  return <CharacterPage characterId={resolvedParams.id} initialCharacterRecord={characterRecord} />
}

export default AiGirlfriendDetailPage
