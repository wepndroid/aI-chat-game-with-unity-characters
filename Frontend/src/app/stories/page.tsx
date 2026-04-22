import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

/** Stories are surfaced on each character page; the old hub URL forwards here. */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/stories'
  }
}

export default function StoriesIndexPage() {
  redirect('/ai-girlfriends')
}
