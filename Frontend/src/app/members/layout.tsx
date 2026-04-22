import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type MembersLayoutProps = Readonly<{
  children: React.ReactNode
}>

const MembersLayout = ({ children }: MembersLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default MembersLayout
