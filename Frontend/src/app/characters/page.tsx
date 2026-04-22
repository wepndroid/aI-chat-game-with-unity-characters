import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/characters'
  }
}

const CharactersLegacyPage = () => {
  redirect('/ai-girlfriends')
}

export default CharactersLegacyPage
