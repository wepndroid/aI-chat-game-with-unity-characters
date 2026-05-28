import type { Metadata } from 'next'
import { Suspense } from 'react'
import LpChatPage from '@/components/landing/lp-chat-page'
import { absoluteUrl } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'AI Girlfriend Chat Preview'
  const description =
    'Preview a SecretWaifu roleplay chat, watch the response unfold, and continue the conversation by creating an account.'

  return {
    title,
    description,
    alternates: {
      canonical: '/lp-chat'
    },
    robots: {
      index: false,
      follow: false
    },
    openGraph: {
      title: `${title} | SecretWaifu.com`,
      description,
      url: absoluteUrl('/lp-chat'),
      images: ['/images/landing/header-girl.png']
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SecretWaifu.com`,
      description,
      images: ['/images/landing/header-girl.png']
    }
  }
}

const ChatLandingPage = () => {
  return (
    <Suspense fallback={null}>
      <LpChatPage />
    </Suspense>
  )
}

export default ChatLandingPage
