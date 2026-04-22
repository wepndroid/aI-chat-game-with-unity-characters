import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type YourCharactersLayoutProps = Readonly<{
  children: React.ReactNode
}>

const YourCharactersLayout = ({ children }: YourCharactersLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default YourCharactersLayout
