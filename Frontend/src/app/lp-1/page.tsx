import type { Metadata } from 'next'
import { Suspense } from 'react'
import Lp1Page from '@/components/landing/lp-1-page'
import { absoluteUrl } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'AI Anime Girlfriend Experience'
  const description =
    "Enter SecretWaifu's living digital sanctuary for voice-enabled AI girlfriends, VRoid characters, deep customization, speech-to-text, VR support, and monthly updates."

  return {
    title,
    description,
    alternates: {
      canonical: '/'
    },
    robots: {
      index: false,
      follow: false
    },
    openGraph: {
      title: `${title} | SecretWaifu.com`,
      description,
      url: absoluteUrl('/lp-1'),
      images: ['/images/landing/vroid-girls.jpg']
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SecretWaifu.com`,
      description,
      images: ['/images/landing/vroid-girls.jpg']
    }
  }
}

const RootPage = () => {
  return (
    <Suspense fallback={null}>
      <Lp1Page />
    </Suspense>
  )
}

export default RootPage
