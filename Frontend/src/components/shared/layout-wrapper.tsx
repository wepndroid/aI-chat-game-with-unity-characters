'use client'

import { usePathname } from 'next/navigation'
import Header from '@/components/shared/header'
import Footer from '@/components/shared/footer'

export const ConditionalHeader = () => {
  const pathname = usePathname()
  if (pathname === '/lp-1' || pathname === '/lp-chat') return null
  return <Header />
}

export const ConditionalFooter = () => {
  const pathname = usePathname()
  if (pathname === '/lp-1' || pathname === '/lp-chat') return null
  return <Footer />
}
