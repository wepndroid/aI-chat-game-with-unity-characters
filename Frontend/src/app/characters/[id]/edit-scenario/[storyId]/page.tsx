import EditStoryPage from '@/components/stories/edit-story-page'
import { Suspense } from 'react'

type EditScenarioPageProps = {
  params: Promise<{ id: string; storyId: string }>
}

const EditScenarioPage = async ({ params }: EditScenarioPageProps) => {
  const { id, storyId } = await params

  return (
    <Suspense
      fallback={
        <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
          <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading...</div>
        </main>
      }
    >
      <EditStoryPage storyId={storyId} characterRouteKey={id} />
    </Suspense>
  )
}

export default EditScenarioPage
