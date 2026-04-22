import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type AccountLayoutProps = Readonly<{
  children: React.ReactNode
}>

const AccountLayout = ({ children }: AccountLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default AccountLayout
