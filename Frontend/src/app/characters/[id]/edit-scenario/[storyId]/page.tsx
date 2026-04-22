import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCharacterDetail } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { extractCharacterIdFromRouteKey } from '@/lib/character-route'

type EditScenarioLegacyPageProps = {
  params: Promise<{ id: string; storyId: string }>
}

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/characters'
  }
}

const EditScenarioLegacyPage = async ({ params }: EditScenarioLegacyPageProps) => {
  const resolvedParams = await params
  const legacyCharacterId = extractCharacterIdFromRouteKey(resolvedParams.id)

  try {
    const payload = await getCharacterDetail(legacyCharacterId)
    const nextRouteKey = buildAiGirlfriendRouteKey(payload.data.name, payload.data.id)
    redirect(`/ai-girlfriends/${encodeURIComponent(nextRouteKey)}/edit-scenario/${encodeURIComponent(resolvedParams.storyId)}`)
  } catch {
    redirect('/ai-girlfriends')
  }
}

export default EditScenarioLegacyPage
