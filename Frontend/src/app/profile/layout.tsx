import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type ProfileLayoutProps = Readonly<{
  children: React.ReactNode
}>

const ProfileLayout = ({ children }: ProfileLayoutProps) => {
  return <RouteAccessGuard>{children}</RouteAccessGuard>
}

export default ProfileLayout
