import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/chat-faq'
  }
}

const ChatFaqPage = () => {
  redirect('/members')
}

export default ChatFaqPage
