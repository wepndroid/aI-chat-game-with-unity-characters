import type { Metadata } from 'next'
import LegacyEditRedirect from '../legacy-edit-redirect'
import { Suspense } from 'react'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/stories'
  }
}

const StoryEditLegacyRoute = () => {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
          <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Redirecting…</div>
        </main>
      }
    >
      <LegacyEditRedirect />
    </Suspense>
  )
}

export default StoryEditLegacyRoute
