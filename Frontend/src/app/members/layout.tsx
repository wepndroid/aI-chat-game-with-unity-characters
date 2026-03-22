import RouteAccessGuard from '@/components/shared/route-access-guard'

type MembersLayoutProps = Readonly<{
  children: React.ReactNode
}>

const MembersLayout = ({ children }: MembersLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default MembersLayout
