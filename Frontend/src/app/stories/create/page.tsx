import { Suspense } from 'react'
import CreateStoryPage from '@/components/stories/create-story-page'

const StoriesCreateFallback = () => (
  <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
    <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading…</div>
  </main>
)

const StoriesCreatePage = () => {
  return (
    <Suspense fallback={<StoriesCreateFallback />}>
      <CreateStoryPage />
    </Suspense>
  )
}

export default StoriesCreatePage
