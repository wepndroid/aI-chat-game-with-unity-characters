import RouteAccessGuard from '@/components/shared/route-access-guard'

type AccountLayoutProps = Readonly<{
  children: React.ReactNode
}>

const AccountLayout = ({ children }: AccountLayoutProps) => {
  return <RouteAccessGuard>{children}</RouteAccessGuard>
}

export default AccountLayout
