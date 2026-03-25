import RouteAccessGuard from '@/components/shared/route-access-guard'

type AdminLayoutProps = Readonly<{
  children: React.ReactNode
}>

const isAdminBypassForTestingEnabled = process.env.NEXT_PUBLIC_ADMIN_TEST_BYPASS === 'true'

const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <RouteAccessGuard requiredRole={isAdminBypassForTestingEnabled ? undefined : 'ADMIN'} requireVerifiedEmail={!isAdminBypassForTestingEnabled}>
      {children}
    </RouteAccessGuard>
  )
}

export default AdminLayout
