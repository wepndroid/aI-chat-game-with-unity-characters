import type { Metadata } from 'next'
import RouteAccessGuard from '@/components/shared/route-access-guard'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

type AdminLayoutProps = Readonly<{
  children: React.ReactNode
}>

const AdminLayout = ({ children }: AdminLayoutProps) => {
  return <RouteAccessGuard requiredRole="ADMIN">{children}</RouteAccessGuard>
}

export default AdminLayout
