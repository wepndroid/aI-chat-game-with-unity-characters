import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type UploadVrmLayoutProps = Readonly<{
  children: React.ReactNode
}>

const UploadVrmLayout = ({ children }: UploadVrmLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default UploadVrmLayout
