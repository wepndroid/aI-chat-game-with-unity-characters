import RouteAccessGuard from '@/components/shared/route-access-guard'

type ProfileLayoutProps = Readonly<{
  children: React.ReactNode
}>

const ProfileLayout = ({ children }: ProfileLayoutProps) => {
  return <RouteAccessGuard>{children}</RouteAccessGuard>
}

export default ProfileLayout
