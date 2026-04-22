import type { Metadata } from 'next'
import CharacterPage from '@/components/character/character-page'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/character'
  }
}

const CharacterRootPage = () => {
  return <CharacterPage />
}

export default CharacterRootPage
