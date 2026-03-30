import RouteAccessGuard from '@/components/shared/route-access-guard'

type AdminLayoutProps = Readonly<{
  children: React.ReactNode
}>

const AdminLayout = ({ children }: AdminLayoutProps) => {
  return <RouteAccessGuard requiredRole="ADMIN">{children}</RouteAccessGuard>
}

export default AdminLayout
