import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCharacterDetail } from '@/lib/character-api'
import { buildAiGirlfriendRouteKey } from '@/lib/ai-girlfriend-route'
import { extractCharacterIdFromRouteKey } from '@/lib/character-route'

type WriteScenarioLegacyPageProps = {
  params: Promise<{ id: string }>
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

const WriteScenarioLegacyPage = async ({ params }: WriteScenarioLegacyPageProps) => {
  const resolvedParams = await params
  const legacyCharacterId = extractCharacterIdFromRouteKey(resolvedParams.id)

  try {
    const payload = await getCharacterDetail(legacyCharacterId)
    const nextRouteKey = buildAiGirlfriendRouteKey(payload.data.name, payload.data.id)
    redirect(`/ai-girlfriends/${encodeURIComponent(nextRouteKey)}/write-scenario`)
  } catch {
    redirect('/ai-girlfriends')
  }
}

export default WriteScenarioLegacyPage
