import type { Metadata } from 'next'
import { Suspense } from 'react'
import CreateStoryPage from '@/components/stories/create-story-page'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/ai-girlfriends'
  }
}

type WriteScenarioPageProps = {
  params: Promise<{ id: string }>
}

const WriteScenarioFallback = () => (
  <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
    <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading…</div>
  </main>
)

const WriteScenarioPage = async ({ params }: WriteScenarioPageProps) => {
  const resolvedParams = await params

  return (
    <Suspense fallback={<WriteScenarioFallback />}>
      <CreateStoryPage routeCharacterKey={resolvedParams.id} />
    </Suspense>
  )
}

export default WriteScenarioPage
