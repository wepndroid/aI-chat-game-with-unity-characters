import RouteAccessGuard from '@/components/shared/route-access-guard'

type YourScenariosLayoutProps = Readonly<{
  children: React.ReactNode
}>

const YourScenariosLayout = ({ children }: YourScenariosLayoutProps) => {
  return <RouteAccessGuard requireVerifiedEmail>{children}</RouteAccessGuard>
}

export default YourScenariosLayout
