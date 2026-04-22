import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/support'
  }
}

const SupportPage = () => {
  redirect('/download')
}

export default SupportPage
