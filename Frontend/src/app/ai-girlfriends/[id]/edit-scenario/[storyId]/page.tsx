import type { Metadata } from 'next'
import { Suspense } from 'react'
import EditStoryPage from '@/components/stories/edit-story-page'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/ai-girlfriends'
  }
}

type EditScenarioPageProps = {
  params: Promise<{ id: string; storyId: string }>
}

const EditScenarioFallback = () => (
  <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
    <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading…</div>
  </main>
)

const EditScenarioPage = async ({ params }: EditScenarioPageProps) => {
  const resolvedParams = await params

  return (
    <Suspense fallback={<EditScenarioFallback />}>
      <EditStoryPage storyId={resolvedParams.storyId} characterRouteKey={resolvedParams.id} />
    </Suspense>
  )
}

export default EditScenarioPage
