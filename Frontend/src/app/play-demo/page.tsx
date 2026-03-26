import { Suspense } from 'react'
import PlayDemoClient from './play-demo-client'

const PlayDemoFallback = () => (
  <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
    <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading demo…</div>
  </main>
)

const PlayDemoPage = () => {
  return (
    <Suspense fallback={<PlayDemoFallback />}>
      <PlayDemoClient />
    </Suspense>
  )
}

export default PlayDemoPage
